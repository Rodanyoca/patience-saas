import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, dossiers, services, suppliers } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { EmptyState, PageHeader, Panel, RefTag, SearchForm, StatusPill, TabLinks } from '@/components/shared'
import { SERVICE_STATUS, SERVICE_TYPES, type ServiceType } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

export const metadata: Metadata = { title: 'Prestations' }

const KEY_DETAIL: Record<ServiceType, { key: string; label: string; date?: string }> = {
  visa: { key: 'country', label: 'Pays', date: 'appointmentDate' },
  billet: { key: 'itinerary', label: 'Itinéraire', date: 'departureDate' },
  hotel: { key: 'hotelName', label: 'Hôtel', date: 'checkIn' },
  assurance: { key: 'insurer', label: 'Assureur', date: 'coverageStart' },
}
const REF_DETAIL: Record<ServiceType, string> = {
  visa: 'visaType',
  billet: 'pnr',
  hotel: 'confirmationRef',
  assurance: 'policyNumber',
}

export default async function PrestationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; status?: string }>
}) {
  await requirePageUser()
  const sp = await searchParams
  const type = (sp.type && sp.type in SERVICE_TYPES ? sp.type : 'billet') as ServiceType
  const term = sp.q?.trim()

  const filters: SQL[] = [eq(services.type, type)]
  if (sp.status && sp.status in SERVICE_STATUS[type]) filters.push(eq(services.status, sp.status))
  if (term) {
    const like = `%${term}%`
    filters.push(
      or(
        ilike(services.description, like),
        ilike(dossiers.reference, like),
        ilike(sql`${services.details}::text`, like),
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
      )!,
    )
  }

  const [rows, counts] = await Promise.all([
    db
      .select({ s: services, dossierRef: dossiers.reference, clientFirst: clients.firstName, clientLast: clients.lastName, supplier: suppliers.name })
      .from(services)
      .innerJoin(dossiers, eq(dossiers.id, services.dossierId))
      .innerJoin(clients, eq(clients.id, dossiers.clientId))
      .leftJoin(suppliers, eq(suppliers.id, services.supplierId))
      .where(and(...filters))
      .orderBy(desc(services.updatedAt))
      .limit(300),
    db.select({ type: services.type, count: sql<number>`count(*)::int` }).from(services).groupBy(services.type),
  ])
  const detail = KEY_DETAIL[type]

  return (
    <>
      <PageHeader
        title="Prestations"
        description="Vue transversale des visas, billets, hôtels et assurances, tous dossiers confondus."
      />
      <TabLinks
        active={type}
        tabs={(Object.keys(SERVICE_TYPES) as ServiceType[]).map((t) => ({
          key: t,
          label: SERVICE_TYPES[t],
          href: `/prestations?type=${t}`,
          count: counts.find((c) => c.type === t)?.count ?? 0,
        }))}
      />
      <div className="flex flex-wrap gap-2">
        {[['', 'Tous'], ...Object.entries(SERVICE_STATUS[type])].map(([k, v]) => (
          <Link
            key={k || 'all'}
            href={`/prestations?type=${type}${k ? `&status=${k}` : ''}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              (sp.status ?? '') === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
            }`}
          >
            {v}
          </Link>
        ))}
      </div>
      <SearchForm placeholder="PNR, n° de police, client, dossier…" defaultValue={term}>
        <input type="hidden" name="type" value={type} />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
      </SearchForm>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Aucune prestation">Les prestations s’ajoutent depuis un dossier.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Dossier</th>
                  <th className="px-4 py-2.5 font-medium">Prestation</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">{detail.label}</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Référence</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Date</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Vente</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ s, dossierRef, clientFirst, clientLast, supplier }) => (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <RefTag href={`/dossiers/${s.dossierId}?tab=prestations`}>{dossierRef}</RefTag>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {clientFirst} {clientLast.toUpperCase()}
                        {supplier && ` · ${supplier}`}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{s.details?.[detail.key] ?? '—'}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs lg:table-cell">{s.details?.[REF_DETAIL[type]] ?? '—'}</td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {detail.date && s.details?.[detail.date] ? formatDate(s.details[detail.date].slice(0, 10)) : '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-right font-mono sm:table-cell">{formatMoney(s.salePrice, s.currency)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} label={SERVICE_STATUS[type][s.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
