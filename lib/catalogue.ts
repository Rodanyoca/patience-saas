import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { prestationTypes, services } from '@/lib/db/schema'
import { requireBranch } from '@/lib/branches'
import type { CurrentUser } from '@/lib/session'
export type CatalogueOption = Pick<typeof prestationTypes.$inferSelect, 'id' | 'code' | 'name' | 'active' | 'formType' | 'legacyType'>
export const serviceNameSql = sql<string>`coalesce((select p.name from prestation_types p where p.id=${services.prestationTypeId}),${services.type})`
export const serviceFormSql = sql<string>`coalesce((select p.form_type from prestation_types p where p.id=${services.prestationTypeId}),'generic')`
export async function catalogueOptions(actor: CurrentUser, branchId: string) {
  const branch=await requireBranch(actor, branchId,false)
  if(!branch.active)return []
  return db.select({ id: prestationTypes.id, code: prestationTypes.code, name: prestationTypes.name, active: prestationTypes.active, formType: prestationTypes.formType, legacyType: prestationTypes.legacyType })
    .from(prestationTypes).where(and(eq(prestationTypes.branchId, branchId), eq(prestationTypes.active, true)))
    .orderBy(asc(prestationTypes.displayOrder), asc(prestationTypes.name))
}
