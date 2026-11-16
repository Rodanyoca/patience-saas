import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { cache } from 'react'
import { db, type Database } from '@/lib/db'
import { agencySettings, auditLogs, counters, currencies } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'

export type ActionResult = { ok: boolean; error?: string; id?: number | string }

export async function readSettings(executor: Database = db) {
  const [row] = await executor.select().from(agencySettings).where(eq(agencySettings.id, 1))
  return row
}

export const getSettings = cache(() => readSettings())

export async function getRate(code: string, executor: Database = db) {
  const [row] = await executor.select().from(currencies).where(eq(currencies.code, code))
  if(!row || !row.active || Number(row.rate)<=0)throw new Error('Devise inconnue, inactive ou taux invalide.')
  return Number(row.rate)
}

export async function listCurrencies() {
  return db.select().from(currencies).orderBy(currencies.code)
}

type NumberKind = 'dossier' | 'quote' | 'invoice' | 'receipt' | 'client'

/** Atomic per-year counter producing references like FAC-2026-0007. */
export async function nextNumber(kind: NumberKind, executor: Database = db) {
  const settings = await readSettings(executor)
  const year = new Date().getFullYear()
  const prefix = {
    dossier: settings.dossierPrefix,
    quote: settings.quotePrefix,
    invoice: settings.invoicePrefix,
    receipt: settings.receiptPrefix,
    client: settings.clientPrefix,
  }[kind]
  const key = kind === 'client' ? 'client' : `${kind}-${year}`
  const [row] = await executor
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value })
  const n = String(row.value).padStart(kind === 'client' ? 5 : 4, '0')
  return kind === 'client' ? `${prefix}-${n}` : `${prefix}-${year}-${n}`
}

export async function logAudit(
  user: CurrentUser,
  action: string,
  entity: string,
  entityId?: string | number | null,
  details?: string,
  executor: Database = db,
) {
  await executor.insert(auditLogs).values({
    userId: user.id,
    userName: user.name,
    action,
    entity,
    entityId: entityId != null ? String(entityId) : null,
    details: details ?? null,
  })
}

export function str(fd: FormData, key: string) {
  const v = fd.get(key)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export function num(fd: FormData, key: string) {
  const v = str(fd, key)
  if (v == null) return 0
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export function toErr(e: unknown): ActionResult {
  const sqlError=e as {code?:string;cause?:{code?:string}}
  const code=sqlError?.code??sqlError?.cause?.code
  const message = code ? 'Opération indisponible ou données en conflit. Rechargez la page et réessayez.' : e instanceof Error ? e.message : 'Une erreur est survenue.'
  console.error('[action]', e)
  return { ok: false, error: message }
}
