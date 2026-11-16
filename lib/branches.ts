import 'server-only'
import { and, eq, sql, type SQL, type AnyColumn } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, dossiers } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'

/** Identity/activation and memberships are read from SQL, not trusted from form data. */
export function branchScope(column: AnyColumn | SQL, actor: Pick<CurrentUser, 'id'>) {
  return sql`exists (select 1 from "user" actor where actor.id=${actor.id} and actor.active=true and
    (actor.role='admin' or exists(select 1 from branch_memberships bm where bm.user_id=actor.id and bm.branch_id=${column})))`
}
export async function allowedBranches(actor: CurrentUser) {
  return db.select().from(branches).where(and(eq(branches.active, true), branchScope(branches.id, actor))).orderBy(branches.name)
}
export async function requireBranch(actor: CurrentUser, id: string, active = true) {
  const [branch] = await db.select().from(branches).where(and(eq(branches.id, id), branchScope(branches.id, actor), active ? eq(branches.active, true) : undefined))
  if (!branch) throw new Error('Branche non autorisée ou indisponible.')
  return branch
}
export async function requireDossier(actor: CurrentUser, id: number) {
  const [dossier] = await db.select().from(dossiers).where(and(eq(dossiers.id, id), branchScope(dossiers.branchId, actor)))
  if (!dossier) throw new Error('Dossier introuvable ou accès refusé.')
  return dossier
}
export async function requireCatalogueAdmin(actor: CurrentUser) {
  const result = await db.execute(sql`select 1 from "user" where id=${actor.id} and active=true and role='admin'`)
  if (!result.rowCount) throw new Error('Administration du référentiel non autorisée.')
}
