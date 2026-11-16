import 'server-only'
import { sql } from 'drizzle-orm'
import { dossiers, commercialDocs } from '@/lib/db/schema'
import { branchScope } from '@/lib/branches'
import type { CurrentUser } from '@/lib/session'
export function commercialScope(actor:CurrentUser){
 return sql`exists(select 1 from ${dossiers} where ${dossiers.id}=${commercialDocs.dossierId} and ${branchScope(dossiers.branchId,actor)})`
}
