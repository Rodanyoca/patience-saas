'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { cashMovements, expenses, supplierPayments, suppliers } from '@/lib/db/schema'
import { MANAGERS, requireUser } from '@/lib/session'
import { getRate, logAudit, num, str, toErr, type ActionResult } from '@/lib/server-utils'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, SUPPLIER_CATEGORIES } from '@/lib/constants'
import { formatMoney } from '@/lib/format'

function supplierValues(fd: FormData) {
  const name = str(fd, 'name')
  if (!name) throw new Error('Le nom du fournisseur est obligatoire.')
  const category = str(fd, 'category') ?? 'autre'
  if (!(category in SUPPLIER_CATEGORIES)) throw new Error('Catégorie invalide.')
  return {
    name,
    category,
    contactName: str(fd, 'contactName'),
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    address: str(fd, 'address'),
    notes: str(fd, 'notes'),
  }
}

export async function createSupplier(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const values = supplierValues(fd)
    const [row] = await db.insert(suppliers).values(values).returning({ id: suppliers.id })
    await logAudit(user, 'Création', 'fournisseur', row.id, values.name)
    revalidatePath('/fournisseurs')
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateSupplier(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    await db
      .update(suppliers)
      .set({ ...supplierValues(fd), active: fd.get('active') === 'on' })
      .where(eq(suppliers.id, id))
    await logAudit(user, 'Modification', 'fournisseur', id)
    revalidatePath(`/fournisseurs/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

async function money(fd: FormData) {
  const amount = num(fd, 'amount')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.')
  const method = str(fd, 'method') ?? 'especes'
  if (!(method in PAYMENT_METHODS)) throw new Error('Mode de paiement invalide.')
  const currency = str(fd, 'currency') ?? 'USD'
  return { amount: amount.toFixed(2), method, currency, rate: String(await getRate(currency)) }
}

export async function recordSupplierPayment(supplierId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const m = await money(fd)
    const [row] = await db
      .insert(supplierPayments)
      .values({
        ...m,
        supplierId,
        serviceId: Number(str(fd, 'serviceId')) || null,
        reference: str(fd, 'reference'),
        paidAt: str(fd, 'paidAt') ?? undefined,
        notes: str(fd, 'notes'),
        createdBy: user.id,
      })
      .returning({ id: supplierPayments.id })
    await logAudit(user, 'Paiement fournisseur', 'fournisseur', supplierId, formatMoney(m.amount, m.currency))
    revalidatePath(`/fournisseurs/${supplierId}`)
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteSupplierPayment(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const [p] = await db.delete(supplierPayments).where(eq(supplierPayments.id, id)).returning()
    await logAudit(user, 'Suppression paiement fournisseur', 'fournisseur', p?.supplierId)
    revalidatePath('/fournisseurs')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function createExpense(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const label = str(fd, 'label')
    if (!label) throw new Error('Libellé obligatoire.')
    const category = str(fd, 'category') ?? 'autre'
    if (!(category in EXPENSE_CATEGORIES)) throw new Error('Catégorie invalide.')
    const m = await money(fd)
    const [row] = await db
      .insert(expenses)
      .values({ ...m, label, category, paidAt: str(fd, 'paidAt') ?? undefined, notes: str(fd, 'notes'), createdBy: user.id })
      .returning({ id: expenses.id })
    await logAudit(user, 'Dépense', 'finance', row.id, `${label} — ${formatMoney(m.amount, m.currency)}`)
    revalidatePath('/finances')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    await db.delete(expenses).where(eq(expenses.id, id))
    await logAudit(user, 'Suppression dépense', 'finance', id)
    revalidatePath('/finances')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function createCashMovement(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const label = str(fd, 'label')
    if (!label) throw new Error('Libellé obligatoire.')
    const direction = str(fd, 'direction') === 'sortie' ? 'sortie' : 'entree'
    const amount = num(fd, 'amount')
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide.')
    const currency = str(fd, 'currency') ?? 'USD'
    await db.insert(cashMovements).values({
      direction,
      label,
      amount: amount.toFixed(2),
      currency,
      rate: String(await getRate(currency)),
      occurredAt: str(fd, 'occurredAt') ?? undefined,
      notes: str(fd, 'notes'),
      createdBy: user.id,
    })
    await logAudit(user, direction === 'entree' ? 'Entrée de caisse' : 'Sortie de caisse', 'caisse', null, `${label} — ${formatMoney(amount, currency)}`)
    revalidatePath('/finances')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteCashMovement(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    await db.delete(cashMovements).where(eq(cashMovements.id, id))
    await logAudit(user, 'Suppression mouvement de caisse', 'caisse', id)
    revalidatePath('/finances')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
