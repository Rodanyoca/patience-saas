import { Pagination } from '@/components/pagination'
import { pageNumber, PAGE_SIZE } from '@/lib/pagination'
import { prestationTypes } from '@/lib/db/schema'
import { branchScope } from '@/lib/branches'
import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, dossiers, services, user as users } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { EmptyState, FilterSelect, PageHeader, Panel, Pill, RefTag, SearchForm, StatusPill } from '@/components/shared'
import { buttonVariants } from '@/components/ui/button'
import { DOSSIER_STATUS, SERVICE_TYPES, type DossierStatus, type ServiceType } from '@/lib/constants'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Dossiers' }

export default async function DossiersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?:string; q?: string; status?: string; type?: string; mine?: string; agent?: string }>
}) {
  const me = await requirePageUser()
  const sp = await searchParams
  const page=pageNumber(sp.page)
  const term = sp.q?.trim()
  const catalogue = await db.select({id:prestationTypes.id,name:prestationTypes.name}).from(prestationTypes).where(branchScope(prestationTypes.branchId,me)).orderBy(prestationTypes.name)
  const filters: SQL[] = [branchScope(dossiers.branchId,me)]
  if (term) {
    const like = `%${term}%`
    filters.push(
      or(
        ilike(dossiers.reference, like),
        ilike(dossiers.title, like),
        ilike(dossiers.destination, like),
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
        ilike(clients.phone, like),
      )!,
    )
  }
  if (sp.status && sp.status in DOSSIER_STATUS) filters.push(eq(dossiers.status, sp.status))
  if (sp.mine === '1') filters.push(eq(dossiers.agentId, me.id))
  if (sp.type) {
    filters.push(sql`exists (select 1 from ${services} where ${services.dossierId} = ${dossiers.id} and (${services.prestationTypeId} = ${sp.type} or ${services.type} = ${sp.type}))`)
  }

  const pageRows = await db
    .select({
      id: dossiers.id,
      reference: dossiers.reference,
      title: dossiers.title,
      destination: dossiers.destination,
      status: dossiers.status,
      priority: dossiers.priority,
      departureDate: dossiers.departureDate,
      dueDate: dossiers.dueDate,
      createdAt: dossiers.createdAt,
      clientId: clients.id,
      clientFirst: clients.firstName,
      clientLast: clients.lastName,
      agentName: users.name,
      types: sql<string[]>`coalesce((select array_agg(distinct coalesce((select p.name from prestation_types p where p.id=${services.prestationTypeId}),${services.type})) from ${services} where ${services.dossierId} = ${dossiers.id}), '{}')`,
    })
    .from(dossiers)
    .innerJoin(clients, eq(clients.id, dossiers.clientId))
    .leftJoin(users, eq(users.id, dossiers.agentId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(sql`case ${dossiers.priority} when 'urgente' then 0 else 1 end`, desc(dossiers.updatedAt))
    .limit(PAGE_SIZE+1).offset((page-1)*PAGE_SIZE)

  const counts = await db
    .select({ status: dossiers.status, count: sql<number>`count(*)::int` })
    .from(dossiers)
    .where(branchScope(dossiers.branchId,me))
    .groupBy(dossiers.status)
  const countOf = (s: string) => counts.find((c) => c.status === s)?.count ?? 0

  const rows=pageRows.slice(0,PAGE_SIZE)

  return (
    <>
      <PageHeader
        title="Dossiers"
        description="Suivi de chaque demande, de l’enregistrement à la clôture."
        actions={
          <Link href="/dossiers/new" className={buttonVariants()}>
            <Plus /> Nouveau dossier
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'Tous', count: counts.reduce((a, c) => a + c.count, 0) },
          ...Object.entries(DOSSIER_STATUS).map(([k, v]) => ({ key: k, label: v, count: countOf(k) })),
        ].map((s) => {
          const active = (sp.status ?? '') === s.key
          const params = new URLSearchParams({ ...(s.key && { status: s.key }), ...(sp.mine && { mine: sp.mine }) })
          return (
            <Link
              key={s.key || 'all'}
              href={`/dossiers${params.size ? `?${params}` : ''}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              }`}
            >
              {s.label}
              <span className="font-mono text-xs opacity-70">{s.count}</span>
            </Link>
          )
        })}
      </div>

      <SearchForm placeholder="Référence, client, destination…" defaultValue={term}>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <FilterSelect name="type" defaultValue={sp.type} options={Object.fromEntries(catalogue.map(p=>[p.id,p.name]))} allLabel="Toutes prestations" />
        <label className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm">
          <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === '1'} className="accent-primary" />
          Mes dossiers
        </label>
      </SearchForm>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Aucun dossier">Aucun dossier ne correspond à ces critères.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Référence</th>
                  <th className="px-4 py-2.5 font-medium">Objet / client</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Prestations</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Départ</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <RefTag href={`/dossiers/${d.id}`}>{d.reference}</RefTag>
                        {d.priority === 'urgente' && <Pill tone="accent">Urgent</Pill>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={`/dossiers/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {d.clientFirst} {d.clientLast.toUpperCase()}
                        {d.destination && ` · ${d.destination}`}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 align-top lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {d.types.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          d.types.map((t) => <Pill key={t}>{t}</Pill>)
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 align-top md:table-cell">{formatDate(d.departureDate)}</td>
                    <td className="hidden px-4 py-3 align-top text-muted-foreground md:table-cell">
                      {d.agentName ?? 'Non attribué'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill status={d.status} label={DOSSIER_STATUS[d.status as DossierStatus]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Pagination path="/dossiers" params={sp} page={page} hasNext={pageRows.length>PAGE_SIZE}/>
    </>
  )
}
