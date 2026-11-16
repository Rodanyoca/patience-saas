import {sql} from 'drizzle-orm'
import {branchScope} from '@/lib/branches'
import type {CurrentUser} from '@/lib/session'
import type {Period} from '@/lib/period'
export function monthlyFlowQuery(actor:CurrentUser,{from,to}:Period){return sql`
 with months as (select to_char(m,'YYYY-MM') AS month_key from generate_series(date_trunc('month',${from}::date),date_trunc('month',${to}::date),interval '1 month') m),
 receipts as(select to_char(paid_at,'YYYY-MM') AS month_key,sum(amount*rate) total from payments where paid_at between ${from} and ${to} and exists(select 1 from dossiers d where d.id=payments.dossier_id and ${branchScope(sql`d.branch_id`,actor)}) group by 1),
 suppliers as(select to_char(paid_at,'YYYY-MM') AS month_key,sum(amount*rate) total from supplier_payments where paid_at between ${from} and ${to} group by 1),
 charges as(select to_char(paid_at,'YYYY-MM') AS month_key,sum(amount*rate) total from expenses where paid_at between ${from} and ${to} group by 1)
 select m.month_key AS month,coalesce(r.total,0) recettes,coalesce(s.total,0) fournisseurs,coalesce(c.total,0) depenses from months m left join receipts r using(month_key) left join suppliers s using(month_key) left join charges c using(month_key) order by m.month_key
 `}
