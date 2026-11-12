import type { Metadata } from 'next'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { FileSpreadsheet, FolderPlus } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/session'
import { monthlyFlows, periodSummary, receivables, resolvePeriod } from '@/lib/reports'
import { EmptyState, PageHeader, Panel, Pill, RefTag, StatusPill } from '@/components/shared'
import { PeriodForm } from '@/components/period-form'
import { FlowsChart, ShareChart } from '@/components/charts'
import { buttonVariants } from '@/components/ui/button'
import { DOSSIER_STATUS, SERVICE_TYPES, type DossierStatus, type ServiceType } from '@/lib/constants'
import { formatDate, formatMoney, todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Tableau de bord' }

type Deadline = {
  kind: string
  date: string
  dossier_id: number
  reference: string
  title: string
  client: string
  priority: string
  status: string
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; refus?: string }>
}) {
  const user = await requirePageUser()
  const sp = await searchParams
  const period = resolvePeriod(sp)
  const isManager = user.role !== 'agent'

  const [countsRes, typeRes, deadlinesRes, summary, flows, openInvoices] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from clients) as clients,
        (select count(*)::int from clients where created_at::date between ${period.from} and ${period.to}) as new_clients,
        (select count(*)::int from dossiers where status = 'en_attente') as en_attente,
        (select count(*)::int from dossiers where status = 'en_cours') as en_cours,
        (select count(*)::int from dossiers where status = 'termine') as termine,
        (select count(*)::int from dossiers where status = 'annule') as annule,
        (select count(*)::int from dossiers where created_at::date between ${period.from} and ${period.to}) as new_dossiers
    `),
    db.execute(sql`
      select type, count(distinct dossier_id)::int as count from services
      where created_at::date between ${period.from} and ${period.to} group by type order by count desc
    `),
    db.execute(sql`
      select * from (
        select 'Échéance de traitement' as kind, d.due_date::text as date, d.id as dossier_id, d.reference, d.title,
          c.first_name || ' ' || upper(c.last_name) as client, d.priority, d.status
        from dossiers d join clients c on c.id = d.client_id
        where d.status in ('en_attente','en_cours') and d.due_date is not null and d.due_date <= current_date + 14
        union all
        select 'Départ', d.departure_date::text, d.id, d.reference, d.title, c.first_name || ' ' || upper(c.last_name), d.priority, d.status
        from dossiers d join clients c on c.id = d.client_id
        where d.status in ('en_attente','en_cours') and d.departure_date between current_date and current_date + 14
        union all
        select 'Rendez-vous consulaire', s.details->>'appointmentDate', d.id, d.reference, s.description, c.first_name || ' ' || upper(c.last_name), d.priority, d.status
        from services s join dossiers d on d.id = s.dossier_id join clients c on c.id = d.client_id
        where s.type = 'visa' and s.status not in ('accorde','refuse') and coalesce(s.details->>'appointmentDate','') <> ''
          and (s.details->>'appointmentDate')::date between current_date and current_date + 14
        union all
        select 'Dossier urgent', d.updated_at::date::text, d.id, d.reference, d.title, c.first_name || ' ' || upper(c.last_name), d.priority, d.status
        from dossiers d join clients c on c.id = d.client_id
        where d.status in ('en_attente','en_cours') and d.priority = 'urgente'
      ) x order by case when priority = 'urgente' then 0 else 1 end, date limit 12
    `),
    isManager ? periodSummary(period) : Promise.resolve(null),
    isManager ? monthlyFlows(period) : Promise.resolve([]),
    receivables(),
  ])

  const c = countsRes.rows[0] as Record<string, number>
  const byType = typeRes.rows as { type: string; count: number }[]
  const deadlines = deadlinesRes.rows as Deadline[]
  const dueTotal = openInvoices.reduce((a, r) => a + Number(r.total) - Number(r.paid), 0)
  const today = todayISO()
  const overdue = openInvoices.filter((r) => r.due_date && r.due_date < today)

  return (
    <>
      <PageHeader
        title={`Bonjour, ${user.name.split(' ')[0]}`}
        description={`Activité de l’agence du ${formatDate(period.from)} au ${formatDate(period.to)}.`}
        actions={
          <>
            <a
              href={`/api/export?report=dossiers&from=${period.from}&to=${period.to}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <FileSpreadsheet /> Export dossiers
            </a>
            <Link href="/dossiers/new" className={buttonVariants()}>
              <FolderPlus /> Nouveau dossier
            </Link>
          </>
        }
      />

      {sp.refus && (
        <p role="alert" className="rounded-md bg-accent px-4 py-3 text-sm text-accent-foreground">
          Vous n’avez pas les autorisations nécessaires pour accéder à cette page.
        </p>
      )}

      <PeriodForm from={period.from} to={period.to} />

      <section aria-label="Dossiers" className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card md:grid-cols-5">
        {[
          { label: 'Clients enregistrés', value: c.clients, sub: `+${c.new_clients} sur la période`, href: '/clients' },
          { label: 'En attente', value: c.en_attente, href: '/dossiers?status=en_attente' },
          { label: 'En cours', value: c.en_cours, href: '/dossiers?status=en_cours' },
          { label: 'Clôturés', value: c.termine, href: '/dossiers?status=termine' },
          { label: 'Annulés', value: c.annule, href: '/dossiers?status=annule' },
        ].map((k, i) => (
          <Link
            key={k.label}
            href={k.href}
            className={`flex flex-col gap-1 border-dashed p-4 hover:bg-muted/50 ${i > 0 ? 'md:border-l' : ''} ${i % 2 === 1 ? 'border-l md:border-l' : ''} ${i >= 2 ? 'border-t md:border-t-0' : ''}`}
          >
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className="font-mono text-2xl font-semibold">{k.value}</span>
            {k.sub && <span className="text-xs text-muted-foreground">{k.sub}</span>}
          </Link>
        ))}
      </section>

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Ventes facturées', value: summary.invoiced },
            { label: 'Encaissements', value: summary.collected },
            { label: 'Dépenses et fournisseurs', value: summary.expenses + summary.supplierPaid },
            { label: 'Marge sur prestations', value: summary.margin },
          ].map((k) => (
            <div key={k.label} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="font-mono text-xl font-semibold">{formatMoney(k.value)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Dossiers urgents et échéances (14 jours)"
          className="lg:col-span-2"
          actions={
            <Link href="/dossiers?mine=1" className="text-xs font-medium text-primary hover:underline">
              Mes dossiers
            </Link>
          }
        >
          {deadlines.length === 0 ? (
            <EmptyState title="Rien d’urgent">Aucune échéance, aucun départ ni rendez-vous dans les 14 prochains jours.</EmptyState>
          ) : (
            <ul className="divide-y">
              {deadlines.map((d, i) => (
                <li key={`${d.kind}-${d.dossier_id}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex w-24 shrink-0 flex-col">
                    <span className="font-mono text-sm">
                      {formatDate(d.date?.slice(0, 10))}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{d.kind}</span>
                  </div>
                  <RefTag href={`/dossiers/${d.dossier_id}`}>{d.reference}</RefTag>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{d.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{d.client}</span>
                  </div>
                  {d.priority === 'urgente' && <Pill tone="accent">Urgent</Pill>}
                  <StatusPill status={d.status} label={DOSSIER_STATUS[d.status as DossierStatus]} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Prestations (dossiers concernés)">
          {byType.length === 0 ? (
            <EmptyState title="Aucune prestation sur la période" />
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <ShareChart
                data={byType.map((t) => ({ key: t.type, label: SERVICE_TYPES[t.type as ServiceType], value: t.count }))}
              />
              <ul className="flex flex-col gap-1.5 text-sm">
                {byType.map((t) => (
                  <li key={t.type} className="flex justify-between">
                    <Link href={`/prestations?type=${t.type}`} className="text-muted-foreground hover:text-foreground hover:underline">
                      {SERVICE_TYPES[t.type as ServiceType]}
                    </Link>
                    <span className="font-mono">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {isManager && (
          <Panel title="Encaissements et décaissements" className="lg:col-span-2" bodyClassName="p-4">
            <FlowsChart
              data={flows.map((f) => ({
                month: f.month,
                recettes: Number(f.recettes),
                sorties: Number(f.fournisseurs) + Number(f.depenses),
              }))}
            />
          </Panel>
        )}
        <Panel
          title="Soldes clients à encaisser"
          className={isManager ? '' : 'lg:col-span-3'}
          actions={isManager && <Link href="/finances?tab=creances" className="text-xs font-medium text-primary hover:underline">Détail</Link>}
        >
          <div className="flex flex-col gap-1 border-b p-4">
            <span className="font-mono text-2xl font-semibold">{formatMoney(dueTotal)}</span>
            <span className="text-xs text-muted-foreground">
              {openInvoices.length} facture{openInvoices.length > 1 ? 's' : ''} non soldée{openInvoices.length > 1 ? 's' : ''}
              {overdue.length > 0 && ` · ${overdue.length} en retard`}
            </span>
          </div>
          {openInvoices.length > 0 && (
            <ul className="divide-y">
              {openInvoices.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <RefTag href={`/facturation/${r.id}`}>{r.number}</RefTag>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.client}</span>
                  <span className={`font-mono ${r.due_date && r.due_date < today ? 'text-destructive' : ''}`}>
                    {formatMoney(Number(r.total) - Number(r.paid), r.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
