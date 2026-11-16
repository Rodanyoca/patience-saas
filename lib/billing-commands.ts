import { Decimal, decimal, moneyField, fixedMoney } from '@/lib/money'
import { isoDate } from '@/lib/dates'
import { captureCommercialSnapshot } from '@/lib/commercial-snapshot'
import { getTableColumns } from 'drizzle-orm'
import { serviceNameSql } from '@/lib/catalogue'
import { requireDossier } from '@/lib/branches'
import { requireCommercialDoc } from '@/lib/commercial-access'
import { notCancelled } from '@/lib/service-sql'


import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { db as rootDb, type Database } from '@/lib/db'
import { commercialDocs, docLines, dossierSteps, dossiers, payments, services, user as users } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { MANAGERS } from '@/lib/roles'
import { getRate as readRate, readSettings, logAudit as writeAudit, nextNumber as allocateNumber, num, str, toErr, type ActionResult } from '@/lib/server-utils'
import { PAYMENT_METHODS, QUOTE_STATUS } from '@/lib/constants'
import { formatMoney } from '@/lib/format'

function makeCommands(db:Database, actor:CurrentUser) {
 const round = (n: number|string|Decimal) => new Decimal(n).toDecimalPlaces(2,Decimal.ROUND_HALF_UP)
 const getSettings=()=>readSettings(db)
 const getRate=(code:string)=>readRate(code,db)
 const nextNumber=(kind:Parameters<typeof allocateNumber>[0])=>allocateNumber(kind,db)
 const logAudit=(user:CurrentUser,action:string,entity:string,id?:string|number|null,details?:string)=>writeAudit(user,action,entity,id,details,db)
 async function requireUser(roles?:CurrentUser['role'][]){
  const [u]=await db.select().from(users).where(eq(users.id,actor.id))
  if(!u||!u.active||(roles&&!roles.includes(u.role as CurrentUser['role'])))throw new Error('Accès refusé.')
  return {...actor,name:u.name,role:u.role as CurrentUser['role']}
 }
 async function lockDoc(id:number){const [doc]=await db.select().from(commercialDocs).where(eq(commercialDocs.id,id)).for('update');if(!doc)throw new Error('Document introuvable.');return doc}


async function step(dossierId: number, label: string, user: CurrentUser, note?: string) {
  await db.insert(dossierSteps).values({ dossierId, label, note, userId: user.id, userName: user.name })
}

async function recalc(docId: number) {
  const [doc] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, docId))
  const [{ subtotal }] = await db
    .select({ subtotal: sql<string>`coalesce(sum(${docLines.total}), 0)` })
    .from(docLines)
    .where(eq(docLines.docId, docId))
  const difference = new Decimal(subtotal).minus(doc.discount)
  const total = difference.lessThan(0) ? new Decimal(0) : difference
  await db
    .update(commercialDocs)
    .set({ subtotal: fixedMoney(subtotal), total: fixedMoney(total) })
    .where(eq(commercialDocs.id, docId))
}

async function invoicePaid(invoiceId: number) {
  const [{ paid }] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.appliedAmount}), 0)` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
  return paid
}

async function refreshInvoiceStatus(invoiceId: number) {
  const [inv] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, invoiceId))
  if (!inv || inv.status === 'annulee') return
  const paid = new Decimal(await invoicePaid(invoiceId))
  const total = Number(inv.total)
  const status = paid.lessThanOrEqualTo(0) ? 'emise' : paid.greaterThanOrEqualTo(total) ? 'payee' : 'partielle'
  await db.update(commercialDocs).set({ status }).where(eq(commercialDocs.id, invoiceId))
}

/** Builds lines from a dossier's prestations, converted into one document currency. */
async function linesFromServices(dossierId: number, onlyUninvoiced: boolean) {
  let rows = await db
    .select({ ...getTableColumns(services), catalogueName: serviceNameSql })
    .from(services)
    .where(and(eq(services.dossierId, dossierId), notCancelled(services.status)))
    .orderBy(asc(services.id))
  if (onlyUninvoiced) {
    const invoiced = await db
      .select({ serviceId: docLines.serviceId })
      .from(docLines)
      .innerJoin(commercialDocs, eq(commercialDocs.id, docLines.docId))
      .where(and(eq(commercialDocs.dossierId, dossierId), eq(commercialDocs.kind, 'facture'), ne(commercialDocs.status, 'annulee')))
    const done = new Set(invoiced.map((i) => i.serviceId))
    rows = rows.filter((r) => !done.has(r.id))
  }
  const settings = await getSettings()
  const currencies = Array.from(new Set(rows.map((r) => r.currency)))
  const currency = currencies.length === 1 ? currencies[0] : settings.defaultCurrency
  const docRate = await getRate(currency)
  const lines = rows.map((r, i) => {
    const unit = r.currency === currency ? new Decimal(r.salePrice) : new Decimal(r.salePrice).times(r.rate).div(String(docRate))
    return {
      serviceId: r.id,
      description: `${r.catalogueName} — ${r.description}`,
      quantity: '1',
      unitPrice: round(unit).toFixed(2),
      total: round(unit).toFixed(2),
      position: i,
    }
  })
  return { lines, currency, rate: docRate }
}

async function createDoc(kind: 'devis' | 'facture', dossierId: number, user: CurrentUser) {
  await requireDossier(user,dossierId)
  const [d] = await db.select().from(dossiers).where(eq(dossiers.id, dossierId)).for('update')
  if (!d) throw new Error('Dossier introuvable.')
  const { lines, currency, rate } = await linesFromServices(dossierId, kind === 'facture')
  if (kind === 'facture' && lines.length === 0) {
    throw new Error('Toutes les prestations de ce dossier sont déjà facturées.')
  }
  const number = await nextNumber(kind === 'devis' ? 'quote' : 'invoice')
  const due = new Date()
  due.setDate(due.getDate() + (kind === 'devis' ? 15 : 7))
  const [doc] = await db
    .insert(commercialDocs)
    .values({
      kind,
      number,
      dossierId,
      clientId: d.clientId,
      status: kind === 'devis' ? 'brouillon' : 'emise',
      snapshot: await captureCommercialSnapshot(db,dossierId),
      currency,
      rate: String(rate),
      dueDate: due.toISOString().slice(0, 10),
      createdBy: user.id,
    })
    .returning({ id: commercialDocs.id })
  if (lines.length) await db.insert(docLines).values(lines.map((l) => ({ ...l, docId: doc.id })))
  await recalc(doc.id)
  await step(dossierId, `${kind === 'devis' ? 'Devis' : 'Facture'} ${number} établi(e)`, user)
  await logAudit(user, 'Création', kind, doc.id, number)
  return doc.id
}

async function createQuote(dossierId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const id = await createDoc('devis', dossierId, user)
    return { ok: true, id }
  } catch (e) {
    return toErr(e)
  }
}

async function createInvoice(dossierId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const id = await createDoc('facture', dossierId, user)
    return { ok: true, id }
  } catch (e) {
    return toErr(e)
  }
}

async function convertQuote(quoteId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await requireCommercialDoc(user,quoteId)
    const q = await lockDoc(quoteId)
    if (!q || q.kind !== 'devis') throw new Error('Devis introuvable.')
    const [existing] = await db
      .select({ id: commercialDocs.id })
      .from(commercialDocs)
      .where(and(eq(commercialDocs.sourceQuoteId, quoteId), ne(commercialDocs.status, 'annulee')))
    if (existing) throw new Error('Ce devis a déjà été converti en facture.')
    const lines = await db.select().from(docLines).where(eq(docLines.docId, quoteId)).orderBy(asc(docLines.position))
    const number = await nextNumber('invoice')
    const due = new Date()
    due.setDate(due.getDate() + 7)
    const [inv] = await db
      .insert(commercialDocs)
      .values({
        kind: 'facture',
        number,
        dossierId: q.dossierId,
        clientId: q.clientId,
        status: 'emise',
        currency: q.currency,
        rate: q.rate,
        discount: q.discount,
        notes: q.notes,
        dueDate: due.toISOString().slice(0, 10),
        sourceQuoteId: q.id,
        snapshot: q.snapshot ?? await captureCommercialSnapshot(db,q.dossierId),
        createdBy: user.id,
      })
      .returning({ id: commercialDocs.id })
    if (lines.length) {
      await db.insert(docLines).values(
        lines.map(({ id: _id, docId: _d, ...l }) => ({ ...l, docId: inv.id })),
      )
    }
    await recalc(inv.id)
    await db.update(commercialDocs).set({ status: 'accepte' }).where(eq(commercialDocs.id, quoteId))
    await step(q.dossierId, `Devis ${q.number} accepté → facture ${number}`, user)
    await logAudit(user, 'Conversion devis', 'facture', inv.id, `${q.number} → ${number}`)
    return { ok: true, id: inv.id }
  } catch (e) {
    return toErr(e)
  }
}

async function setQuoteStatus(quoteId: number, status: keyof typeof QUOTE_STATUS): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await requireCommercialDoc(user,quoteId)
    await lockDoc(quoteId)
    if (!(status in QUOTE_STATUS)) throw new Error('Statut invalide.')
    const [q] = await db
      .update(commercialDocs)
      .set({ status })
      .where(and(eq(commercialDocs.id, quoteId), eq(commercialDocs.kind, 'devis')))
      .returning()
    if (q) await step(q.dossierId, `Devis ${q.number} : ${QUOTE_STATUS[status]}`, user)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function cancelInvoice(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    await requireCommercialDoc(user,id)
    await lockDoc(id)
    if (new Decimal(await invoicePaid(id)).greaterThan(0)) throw new Error('Supprimez d’abord les paiements enregistrés sur cette facture.')
    const [inv] = await db
      .update(commercialDocs)
      .set({ status: 'annulee' })
      .where(and(eq(commercialDocs.id, id), eq(commercialDocs.kind, 'facture')))
      .returning()
    if (inv) {
      await step(inv.dossierId, `Facture ${inv.number} annulée`, user)
      await logAudit(user, 'Annulation', 'facture', id, inv.number)
    }
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function assertEditable(docId: number) {
  await requireCommercialDoc(await requireUser(),docId)
  const doc = await lockDoc(docId)
  if (!doc) throw new Error('Document introuvable.')
  if (doc.kind === 'devis' && doc.status === 'accepte') throw new Error('Un devis accepté ne peut plus être modifié.')
  if (doc.kind === 'facture' && (doc.status === 'annulee' || new Decimal(await invoicePaid(docId)).greaterThan(0))) {
    throw new Error('Une facture ayant reçu des paiements ne peut plus être modifiée.')
  }
  return doc
}

async function addLine(docId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await assertEditable(docId)
    const description = str(fd, 'description')
    const quantity = decimal(str(fd, 'quantity') ?? '1')
    const unitPrice = moneyField(fd, 'unitPrice')
    if (!description) throw new Error('Libellé obligatoire.')
    if (quantity.lessThanOrEqualTo(0)) throw new Error('Quantité ou prix invalide.')
    const [{ pos }] = await db
      .select({ pos: sql<number>`coalesce(max(${docLines.position}), -1)::int + 1` })
      .from(docLines)
      .where(eq(docLines.docId, docId))
    await db.insert(docLines).values({
      docId,
      description,
      quantity: quantity.toFixed(2),
      unitPrice: unitPrice.toFixed(2),
      total: fixedMoney(quantity.times(unitPrice)),
      position: pos,
    })
    await recalc(docId)
    await logAudit(user, 'Ajout ligne', 'document', docId, description)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function deleteLine(lineId: number): Promise<ActionResult> {
  try {
    await requireUser()
    const [line] = await db.select().from(docLines).where(eq(docLines.id, lineId))
    if (!line) throw new Error('Ligne introuvable.')
    await assertEditable(line.docId)
    await db.delete(docLines).where(eq(docLines.id, lineId))
    await recalc(line.docId)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function updateDocMeta(docId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await assertEditable(docId)
    const discount = moneyField(fd, 'discount')
    if (discount.lessThan(0)) throw new Error('Remise invalide.')
    await db
      .update(commercialDocs)
      .set({
        discount: discount.toFixed(2),
        dueDate: isoDate(str(fd, 'dueDate'), 'Échéance'),
        issueDate: isoDate(str(fd, 'issueDate'), 'Date du document') ?? undefined,
        notes: str(fd, 'notes'),
      })
      .where(eq(commercialDocs.id, docId))
    await recalc(docId)
    await logAudit(user, 'Modification', 'document', docId)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function recordPayment(invoiceId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await requireCommercialDoc(user,invoiceId)
    const inv = await lockDoc(invoiceId)
    const requestKey=str(fd,'requestKey')
    if(requestKey){
      if(!/^[a-f0-9-]{36}$/.test(requestKey))throw new Error('Identifiant de demande invalide.')
      const [existing]=await db.select().from(payments).where(eq(payments.requestKey,requestKey))
      if(existing){if(existing.invoiceId!==invoiceId)throw new Error('Demande déjà utilisée.');return {ok:true,id:existing.id}}
    }
    if (!inv || inv.kind !== 'facture') throw new Error('Facture introuvable.')
    if (inv.status === 'annulee') throw new Error('Facture annulée.')
    const amount = moneyField(fd, 'amount', true)
    if (amount.lessThanOrEqualTo(0)) throw new Error('Montant invalide.')
    const method = str(fd, 'method') ?? 'especes'
    if (!(method in PAYMENT_METHODS)) throw new Error('Mode de paiement invalide.')
    const currency = str(fd, 'currency') ?? inv.currency
    const rate = await getRate(currency)
    const applied = currency === inv.currency ? amount : amount.times(String(rate)).div(inv.rate).toDecimalPlaces(2,Decimal.ROUND_HALF_UP)
    const balance = new Decimal(inv.total).minus(await invoicePaid(invoiceId))
    if (applied.greaterThan(balance)) {
      throw new Error(`Le montant dépasse le solde restant (${formatMoney(balance.toString(), inv.currency)}).`)
    }
    const receiptNumber = await nextNumber('receipt')
    const [p] = await db
      .insert(payments)
      .values({
        receiptNumber,
        requestKey,
        invoiceId,
        clientId: inv.clientId,
        dossierId: inv.dossierId,
        amount: amount.toFixed(2),
        currency,
        rate: String(rate),
        appliedAmount: applied.toFixed(2),
        method,
        reference: str(fd, 'reference'),
        paidAt: isoDate(str(fd, 'paidAt'), 'Date de paiement') ?? new Date().toISOString().slice(0, 10),
        notes: str(fd, 'notes'),
        createdBy: user.id,
      })
      .returning({ id: payments.id })
    await refreshInvoiceStatus(invoiceId)
    await step(inv.dossierId, `Paiement reçu : ${formatMoney(amount.toString(), currency)}`, user, `${receiptNumber} — facture ${inv.number}`)
    await logAudit(user, 'Encaissement', 'paiement', p.id, `${receiptNumber} — ${formatMoney(amount.toString(), currency)}`)
    return { ok: true, id: p.id }
  } catch (e) {
    return toErr(e)
  }
}

async function deletePayment(paymentId: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const [p] = await db.select().from(payments).where(eq(payments.id, paymentId))
    if (!p) throw new Error('Paiement introuvable.')
    await requireDossier(user,p.dossierId)
    await lockDoc(p.invoiceId)
    await db.delete(payments).where(eq(payments.id, paymentId))
    await refreshInvoiceStatus(p.invoiceId)
    await step(p.dossierId, `Paiement ${p.receiptNumber} supprimé`, user)
    await logAudit(user, 'Suppression', 'paiement', paymentId, p.receiptNumber)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

return {createQuote,createInvoice,convertQuote,setQuoteStatus,cancelInvoice,addLine,deleteLine,updateDocMeta,recordPayment,deletePayment}
}

type Commands=ReturnType<typeof makeCommands>
export async function executeBilling<K extends keyof Commands>(actor:CurrentUser,operation:K,...args:Parameters<Commands[K]>):Promise<ActionResult>{
 try {
  return await rootDb.transaction(async tx=>{
   const commands=makeCommands(tx,actor)
   const invoke=commands[operation] as (...values:Parameters<Commands[K]>)=>Promise<ActionResult>
   const result=await invoke(...args)
   if(!result.ok)throw new Error(result.error??'Opération refusée.')
   return result
  })
 }catch(e){return toErr(e)}
}
