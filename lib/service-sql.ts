import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { CANCELLED_STATUSES } from '@/lib/prestation-behavior'
export function notCancelled(column: AnyColumn | SQL) {
 return sql`${column} not in (${CANCELLED_STATUSES[0]},${CANCELLED_STATUSES[1]})`
}
