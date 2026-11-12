'use server'

import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { commercialDocs, docLines, dossierSteps, dossiers, payments, services } from '@/lib/db/schema'
import { MANAGERS, requireUser, type CurrentUser } from '@/lib/session'
import { getRate, getSettings, logAudit, nextNumber, num, str, toErr, type ActionResult } from '@/lib/server-utils'
import { PAYMENT_METHODS, QUOTE_STATUS, SERVICE_TYPES, type ServiceType } from '@/lib/constants'
import { formatMoney } from '@/lib/format'

const round = (n: number) => Math.round(n * 100) / 100

async function step(dossierId: number, label: string, user: CurrentUser, note?: string) {
  await db.insert(dossierSteps).values({ dossierId, label, note, userId: user.id, userName: user.name })
}

async function recalc(docId: number) {
  const [doc] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, docId))
  const [{ subtotal }] = await db
    .select({ subtotal: sql<string>`coalesce(sum(${docLines.total}), 0)` })
    .from(docLines)
    .where(eq(docLines.docId, docId))
  const total = Math.max(0, Number(subtotal) - Number(doc.discount))
  await db
    .update(commercialDocs)
    .set({ subtotal: Number(subtotal).toFixed(2), total: total.toFixed(2) })
    .where(eq(commercialDocs.id, docId))
}

async function invoicePaid(invoiceId: number) {
  const [{ paid }] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.appliedAmount}), 0)` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
  return Number(paid)
}

async function refreshInvoiceStatus(invoiceId: number) {
  const [inv] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, invoiceId))
  if (!inv || inv.status === 'annulee') return
  const paid = await invoicePaid(invoiceId)
  const total = Number(inv.total)
  const status = paid <= 0.004 ? 'emise' : paid + 0.004 >= total ? 'payee' : 'partielle'
  await db.update(commercialDocs).set({ status }).where(eq(commercialDocs.id, invoiceId))
}

/** Builds lines from a dossier's prestations, converted into one document currency. */
async function linesFromServices(dossierId: number, onlyUninvoiced: boolean) {
  let rows = await db
    .select()
    .from(services)
    .where(and(eq(services.dossierId, dossierId), sql`${services.status} <> 'annule'`))
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
    const unit = r.currency === currency ? Number(r.salePrice) : (Number(r.salePrice) * Number(r.rate)) / docRate
    return {
      serviceId: r.id,
      description: `${SERVICE_TYPES[r.type as ServiceType]} — ${r.description}`,
      quantity: '1',
      unitPrice: round(unit).toFixed(2),
      total: round(unit).toFixed(2),
      position: i,
    }
  })
  return { lines, currency, rate: docRate }
}

async function createDoc(kind: 'devis' | 'facture', dossierId: number, user: CurrentUser) {
  const [d] = await db.select().from(dossiers).where(eq(dossiers.id, dossierId))
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

export async function createQuote(dossierId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const id = await createDoc('devis', dossierId, user)
    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, id }
  } catch (e) {
    return toErr(e)
  }
}

export async function createInvoice(dossierId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const id = await createDoc('facture', dossierId, user)
    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, id }
  } catch (e) {
    return toErr(e)
  }
}

export async function convertQuote(quoteId: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [q] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, quoteId))
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
    revalidatePath(`/facturation/${quoteId}`)
    return { ok: true, id: inv.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function setQuoteStatus(quoteId: number, status: keyof typeof QUOTE_STATUS): Promise<ActionResult> {
  try {
    const user = await requireUser()
    if (!(status in QUOTE_STATUS)) throw new Error('Statut invalide.')
    const [q] = await db
      .update(commercialDocs)
      .set({ status })
      .where(and(eq(commercialDocs.id, quoteId), eq(commercialDocs.kind, 'devis')))
      .returning()
    if (q) await step(q.dossierId, `Devis ${q.number} : ${QUOTE_STATUS[status]}`, user)
    revalidatePath(`/facturation/${quoteId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function cancelInvoice(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    if ((await invoicePaid(id)) > 0) throw new Error('Supprimez d’abord les paiements enregistrés sur cette facture.')
    const [inv] = await db
      .update(commercialDocs)
      .set({ status: 'annulee' })
      .where(and(eq(commercialDocs.id, id), eq(commercialDocs.kind, 'facture')))
      .returning()
    if (inv) {
      await step(inv.dossierId, `Facture ${inv.number} annulée`, user)
      await logAudit(user, 'Annulation', 'facture', id, inv.number)
    }
    revalidatePath(`/facturation/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function assertEditable(docId: number) {
  const [doc] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, docId))
  if (!doc) throw new Error('Document introuvable.')
  if (doc.kind === 'devis' && doc.status === 'accepte') throw new Error('Un devis accepté ne peut plus être modifié.')
  if (doc.kind === 'facture' && (doc.status === 'annulee' || (await invoicePaid(docId)) > 0)) {
    throw new Error('Une facture ayant reçu des paiements ne peut plus être modifiée.')
  }
  return doc
}

export async function addLine(docId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await assertEditable(docId)
    const description = str(fd, 'description')
    const quantity = num(fd, 'quantity') || 1
    const unitPrice = num(fd, 'unitPrice')
    if (!description) throw new Error('Libellé obligatoire.')
    if (!Number.isFinite(unitPrice) || quantity <= 0) throw new Error('Quantité ou prix invalide.')
    const [{ pos }] = await db
      .select({ pos: sql<number>`coalesce(max(${docLines.position}), -1)::int + 1` })
      .from(docLines)
      .where(eq(docLines.docId, docId))
    await db.insert(docLines).values({
      docId,
      description,
      quantity: quantity.toFixed(2),
      unitPrice: unitPrice.toFixed(2),
      total: round(quantity * unitPrice).toFixed(2),
      position: pos,
    })
    await recalc(docId)
    await logAudit(user, 'Ajout ligne', 'document', docId, description)
    revalidatePath(`/facturation/${docId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteLine(lineId: number): Promise<ActionResult> {
  try {
    await requireUser()
    const [line] = await db.select().from(docLines).where(eq(docLines.id, lineId))
    if (!line) throw new Error('Ligne introuvable.')
    await assertEditable(line.docId)
    await db.delete(docLines).where(eq(docLines.id, lineId))
    await recalc(line.docId)
    revalidatePath(`/facturation/${line.docId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateDocMeta(docId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    await assertEditable(docId)
    const discount = num(fd, 'discount')
    if (!Number.isFinite(discount) || discount < 0) throw new Error('Remise invalide.')
    await db
      .update(commercialDocs)
      .set({
        discount: discount.toFixed(2),
        dueDate: str(fd, 'dueDate'),
        issueDate: str(fd, 'issueDate') ?? undefined,
        notes: str(fd, 'notes'),
      })
      .where(eq(commercialDocs.id, docId))
    await recalc(docId)
    await logAudit(user, 'Modification', 'document', docId)
    revalidatePath(`/facturation/${docId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function recordPayment(invoiceId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [inv] = await db.select().from(commercialDocs).where(eq(commercialDocs.id, invoiceId))
    if (!inv || inv.kind !== 'facture') throw new Error('Facture introuvable.')
    if (inv.status === 'annulee') throw new Error('Facture annulée.')
    const amount = num(fd, 'amount')
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.')
    const method = str(fd, 'method') ?? 'especes'
    if (!(method in PAYMENT_METHODS)) throw new Error('Mode de paiement invalide.')
    const currency = str(fd, 'currency') ?? inv.currency
    const rate = await getRate(currency)
    const applied = currency === inv.currency ? amount : round((amount * rate) / Number(inv.rate))
    const balance = Number(inv.total) - (await invoicePaid(invoiceId))
    if (applied > balance + 0.01) {
      throw new Error(`Le montant dépasse le solde restant (${formatMoney(balance, inv.currency)}).`)
    }
    const receiptNumber = await nextNumber('receipt')
    const [p] = await db
      .insert(payments)
      .values({
        receiptNumber,
        invoiceId,
        clientId: inv.clientId,
        dossierId: inv.dossierId,
        amount: amount.toFixed(2),
        currency,
        rate: String(rate),
        appliedAmount: applied.toFixed(2),
        method,
        reference: str(fd, 'reference'),
        paidAt: str(fd, 'paidAt') ?? new Date().toISOString().slice(0, 10),
        notes: str(fd, 'notes'),
        createdBy: user.id,
      })
      .returning({ id: payments.id })
    await refreshInvoiceStatus(invoiceId)
    await step(inv.dossierId, `Paiement reçu : ${formatMoney(amount, currency)}`, user, `${receiptNumber} — facture ${inv.number}`)
    await logAudit(user, 'Encaissement', 'paiement', p.id, `${receiptNumber} — ${formatMoney(amount, currency)}`)
    revalidatePath(`/facturation/${invoiceId}`)
    return { ok: true, id: p.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function deletePayment(paymentId: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const [p] = await db.select().from(payments).where(eq(payments.id, paymentId))
    if (!p) throw new Error('Paiement introuvable.')
    await db.delete(payments).where(eq(payments.id, paymentId))
    await refreshInvoiceStatus(p.invoiceId)
    await step(p.dossierId, `Paiement ${p.receiptNumber} supprimé`, user)
    await logAudit(user, 'Suppression', 'paiement', paymentId, p.receiptNumber)
    revalidatePath(`/facturation/${p.invoiceId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
