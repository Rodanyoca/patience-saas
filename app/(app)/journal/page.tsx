import { Pagination } from '@/components/pagination'
import { pageNumber, PAGE_SIZE } from '@/lib/pagination'
import type { Metadata } from 'next'
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'
import { MANAGERS, requirePageUser } from '@/lib/session'
import { listStaff } from '@/lib/queries'
import { EmptyState, FilterSelect, PageHeader, Panel, SearchForm } from '@/components/shared'
import { formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: "Journal d'activité" }

const ENTITIES: Record<string, string> = {
  client: 'Clients',
  dossier: 'Dossiers',
  devis: 'Devis',
  facture: 'Factures',
  document: 'Documents',
  paiement: 'Paiements',
  fournisseur: 'Fournisseurs',
  finance: 'Dépenses',
  caisse: 'Caisse',
  utilisateur: 'Utilisateurs',
  agence: 'Paramètres',
  devise: 'Devises',
  rapport: 'Exports',
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ page?:string; q?: string; user?: string; entity?: string }> }) {
  await requirePageUser(MANAGERS)
  const sp = await searchParams
  const page=pageNumber(sp.page)
  const filters: SQL[] = []
  if (sp.user) filters.push(eq(auditLogs.userId, sp.user))
  if (sp.entity) filters.push(eq(auditLogs.entity, sp.entity))
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`
    filters.push(or(ilike(auditLogs.action, like), ilike(auditLogs.details, like))!)
  }
  const [pageRows, staff] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(PAGE_SIZE+1).offset((page-1)*PAGE_SIZE),
    listStaff(),
  ])
  const rows=pageRows.slice(0,PAGE_SIZE)

  return (
    <>
      <PageHeader title="Journal d’activité" description="Traçabilité des opérations importantes effectuées par les utilisateurs." />
      <SearchForm placeholder="Action, détail…" defaultValue={sp.q}>
        <FilterSelect name="user" defaultValue={sp.user} options={Object.fromEntries(staff.map((s) => [s.id, s.name]))} allLabel="Tous les utilisateurs" />
        <FilterSelect name="entity" defaultValue={sp.entity} options={ENTITIES} allLabel="Tous les modules" />
      </SearchForm>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Aucune opération" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Utilisateur</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2.5">{r.userName}</td>
                    <td className="px-4 py-2.5">
                      {r.action}
                      <span className="block text-xs text-muted-foreground">{ENTITIES[r.entity] ?? r.entity}</span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{r.details ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Pagination path="/journal" params={sp} page={page} hasNext={pageRows.length>PAGE_SIZE}/>
    </>
  )
}
