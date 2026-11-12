import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

// All amounts are converted to the base currency (USD) through each row's stored rate.

export type Period = { from: string; to: string }

export function resolvePeriod(sp: { from?: string; to?: string }): Period {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
  return {
    from: valid(sp.from) ?? iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: valid(sp.to) ?? iso(now),
  }
}

async function rows<T>(query: ReturnType<typeof sql>) {
  const res = await db.execute(query)
  return res.rows as T[]
}

export async function periodSummary({ from, to }: Period) {
  const [r] = await rows<Record<string, string>>(sql`
    select
      (select coalesce(sum(total * rate),0) from commercial_docs where kind = 'facture' and status <> 'annulee' and issue_date between ${from} and ${to}) as invoiced,
      (select coalesce(sum(amount * rate),0) from payments where paid_at between ${from} and ${to}) as collected,
      (select coalesce(sum(sale_price * rate),0) from services where status <> 'annule' and created_at::date between ${from} and ${to}) as sales,
      (select coalesce(sum(cost_price * rate),0) from services where status <> 'annule' and created_at::date between ${from} and ${to}) as cost,
      (select coalesce(sum(amount * rate),0) from supplier_payments where paid_at between ${from} and ${to}) as supplier_paid,
      (select coalesce(sum(amount * rate),0) from expenses where paid_at between ${from} and ${to}) as expenses,
      (select coalesce(sum(case when direction = 'entree' then amount * rate else -amount * rate end),0) from cash_movements where occurred_at between ${from} and ${to}) as cash_adjustments
  `)
  const n = (k: string) => Number(r[k] ?? 0)
  return {
    invoiced: n('invoiced'),
    collected: n('collected'),
    sales: n('sales'),
    cost: n('cost'),
    margin: n('sales') - n('cost'),
    supplierPaid: n('supplier_paid'),
    expenses: n('expenses'),
    net: n('collected') - n('supplier_paid') - n('expenses'),
  }
}

export async function monthlyFlows({ from, to }: Period) {
  return rows<{ month: string; recettes: string; fournisseurs: string; depenses: string }>(sql`
    with months as (
      select to_char(m, 'YYYY-MM') as month
      from generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date), interval '1 month') m
    )
    select m.month,
      coalesce((select sum(amount * rate) from payments where to_char(paid_at, 'YYYY-MM') = m.month and paid_at between ${from} and ${to}), 0) as recettes,
      coalesce((select sum(amount * rate) from supplier_payments where to_char(paid_at, 'YYYY-MM') = m.month and paid_at between ${from} and ${to}), 0) as fournisseurs,
      coalesce((select sum(amount * rate) from expenses where to_char(paid_at, 'YYYY-MM') = m.month and paid_at between ${from} and ${to}), 0) as depenses
    from months m order by m.month
  `)
}

export async function marginByType({ from, to }: Period) {
  return rows<{ type: string; count: number; sales: string; cost: string }>(sql`
    select type, count(*)::int as count, coalesce(sum(sale_price * rate),0) as sales, coalesce(sum(cost_price * rate),0) as cost
    from services where status <> 'annule' and created_at::date between ${from} and ${to}
    group by type order by sales desc
  `)
}

export async function marginByDossier({ from, to }: Period) {
  return rows<{ id: number; reference: string; title: string; client: string; sales: string; cost: string }>(sql`
    select d.id, d.reference, d.title, c.first_name || ' ' || upper(c.last_name) as client,
      coalesce(sum(s.sale_price * s.rate),0) as sales, coalesce(sum(s.cost_price * s.rate),0) as cost
    from dossiers d
    join clients c on c.id = d.client_id
    join services s on s.dossier_id = d.id and s.status <> 'annule'
    where d.created_at::date between ${from} and ${to}
    group by d.id, c.first_name, c.last_name
    order by (coalesce(sum(s.sale_price * s.rate),0) - coalesce(sum(s.cost_price * s.rate),0)) desc
    limit 100
  `)
}

export async function expensesByCategory({ from, to }: Period) {
  return rows<{ category: string; total: string }>(sql`
    select category, coalesce(sum(amount * rate),0) as total from expenses
    where paid_at between ${from} and ${to} group by category order by total desc
  `)
}

export async function supplierBalances() {
  return rows<{ id: number; name: string; category: string; active: boolean; owed: string; paid: string }>(sql`
    select s.id, s.name, s.category, s.active,
      coalesce((select sum(cost_price * rate) from services where supplier_id = s.id and status <> 'annule'), 0) as owed,
      coalesce((select sum(amount * rate) from supplier_payments where supplier_id = s.id), 0) as paid
    from suppliers s order by s.name
  `)
}

export type CashLine = {
  date: string
  kind: string
  label: string
  direction: 'entree' | 'sortie'
  amount: string
  currency: string
  base: string
  source: string
  source_id: number
}

/** Cash journal: cash-method receipts and payouts plus manual cash movements. */
export async function cashJournal({ from, to }: Period) {
  const opening = await rows<{ balance: string }>(sql`
    select
      coalesce((select sum(amount * rate) from payments where method = 'especes' and paid_at < ${from}), 0)
      - coalesce((select sum(amount * rate) from supplier_payments where method = 'especes' and paid_at < ${from}), 0)
      - coalesce((select sum(amount * rate) from expenses where method = 'especes' and paid_at < ${from}), 0)
      + coalesce((select sum(case when direction = 'entree' then amount * rate else -amount * rate end) from cash_movements where occurred_at < ${from}), 0)
      as balance
  `)
  const lines = await rows<CashLine>(sql`
    select * from (
      select p.paid_at::text as date, 'Encaissement client' as kind, p.receipt_number || ' — ' || c.first_name || ' ' || upper(c.last_name) as label,
        'entree' as direction, p.amount::text, p.currency, (p.amount * p.rate)::text as base, 'payment' as source, p.id as source_id, p.created_at
      from payments p join clients c on c.id = p.client_id where p.method = 'especes' and p.paid_at between ${from} and ${to}
      union all
      select sp.paid_at::text, 'Paiement fournisseur', s.name || coalesce(' — ' || sp.reference, ''), 'sortie', sp.amount::text, sp.currency, (sp.amount * sp.rate)::text, 'supplier_payment', sp.id, sp.created_at
      from supplier_payments sp join suppliers s on s.id = sp.supplier_id where sp.method = 'especes' and sp.paid_at between ${from} and ${to}
      union all
      select e.paid_at::text, 'Dépense', e.label, 'sortie', e.amount::text, e.currency, (e.amount * e.rate)::text, 'expense', e.id, e.created_at
      from expenses e where e.method = 'especes' and e.paid_at between ${from} and ${to}
      union all
      select m.occurred_at::text, case when m.direction = 'entree' then 'Entrée de caisse' else 'Sortie de caisse' end, m.label, m.direction, m.amount::text, m.currency, (m.amount * m.rate)::text, 'cash', m.id, m.created_at
      from cash_movements m where m.occurred_at between ${from} and ${to}
    ) j order by date, created_at
  `)
  return { opening: Number(opening[0]?.balance ?? 0), lines }
}

export async function receivables() {
  return rows<{ id: number; number: string; client: string; client_id: number; dossier_id: number; due_date: string | null; currency: string; total: string; paid: string }>(sql`
    select d.id, d.number, c.first_name || ' ' || upper(c.last_name) as client, c.id as client_id, d.dossier_id, d.due_date::text, d.currency, d.total,
      coalesce((select sum(applied_amount) from payments p where p.invoice_id = d.id), 0) as paid
    from commercial_docs d join clients c on c.id = d.client_id
    where d.kind = 'facture' and d.status in ('emise', 'partielle')
    order by d.due_date nulls last
  `)
}
