import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { services, prestationTypes } from '@/lib/db/schema'
import { branchScope, requireBranch } from '@/lib/branches'
import { notCancelled } from '@/lib/service-sql'
import type { CurrentUser } from '@/lib/session'
export async function catalogueMargins(actor:CurrentUser,filter:{from?:string;to?:string;branchId?:string;prestationTypeId?:string}={}){
 if(filter.branchId)await requireBranch(actor,filter.branchId,false)
 return db.select({
  type:sql<string>`coalesce(${prestationTypes.id},${services.type})`,
  name:sql<string>`coalesce(${prestationTypes.name},${services.type})`,
  count:sql<number>`count(*)::int`,
  sales:sql<string>`coalesce(sum(${services.salePrice}*${services.rate}),0)`,
  cost:sql<string>`coalesce(sum(${services.costPrice}*${services.rate}),0)`,
 }).from(services).leftJoin(prestationTypes,eq(prestationTypes.id,services.prestationTypeId)).where(and(
  branchScope(services.branchId,actor),notCancelled(services.status),
  filter.branchId?eq(services.branchId,filter.branchId):undefined,
  filter.prestationTypeId?eq(services.prestationTypeId,filter.prestationTypeId):undefined,
  filter.from&&filter.to?sql`${services.createdAt}::date between ${filter.from} and ${filter.to}`:undefined,
 )).groupBy(services.prestationTypeId,prestationTypes.id,prestationTypes.name,services.type).orderBy(prestationTypes.name)
}
