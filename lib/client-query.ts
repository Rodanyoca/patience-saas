import {sql} from 'drizzle-orm'
import {branchScope} from '@/lib/branches'
import type {CurrentUser} from '@/lib/session'
// Explicit SQL identifiers retain the outer correlation in Drizzle single-table selections.
export function clientDossierCount(actor:CurrentUser){return sql<number>`(select count(*)::int from dossiers cd where cd.client_id=clients.id and ${branchScope(sql`cd.branch_id`,actor)})`}
