import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { currencies, suppliers, user } from '@/lib/db/schema'

export async function listStaff() {
  return db
    .select({ id: user.id, name: user.name, role: user.role, active: user.active })
    .from(user)
    .orderBy(asc(user.name))
}

export async function staffOptions() {
  const staff = await listStaff()
  return staff.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))
}

export async function supplierOptions() {
  const rows = await db
    .select({ id: suppliers.id, name: suppliers.name, category: suppliers.category })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name))
  return rows.map((s) => ({ value: String(s.id), label: s.name, category: s.category }))
}

export async function currencyOptions() {
  const rows = await db.select().from(currencies).where(eq(currencies.active, true)).orderBy(asc(currencies.code))
  return rows.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
}
