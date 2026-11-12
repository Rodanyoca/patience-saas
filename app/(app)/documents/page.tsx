import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { Download, Eye, FileText, Lock } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, dossiers, files } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { canAccessFile } from '@/lib/file-access'
import { EmptyState, FilterSelect, PageHeader, Panel, Pill, RefTag, SearchForm } from '@/components/shared'
import { formatSize } from '@/components/file-list'
import { FILE_CATEGORIES } from '@/lib/constants'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Documents' }

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const user = await requirePageUser()
  const sp = await searchParams
  const term = sp.q?.trim()
  const filters: SQL[] = []
  if (sp.category && sp.category in FILE_CATEGORIES) filters.push(eq(files.category, sp.category))
  if (term) {
    const like = `%${term}%`
    filters.push(
      or(
        ilike(files.name, like),
        ilike(dossiers.reference, like),
        ilike(clients.reference, like),
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
      )!,
    )
  }
  const rows = await db
    .select({
      f: files,
      dossierRef: dossiers.reference,
      agentId: dossiers.agentId,
      clientRef: clients.reference,
      clientFirst: clients.firstName,
      clientLast: clients.lastName,
    })
    .from(files)
    .leftJoin(dossiers, eq(dossiers.id, files.dossierId))
    .leftJoin(clients, eq(clients.id, files.clientId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(files.createdAt))
    .limit(300)

  return (
    <>
      <PageHeader
        title="Gestion documentaire"
        description="Archive numérique classée par client et par dossier. Les documents s’ajoutent depuis la fiche client ou le dossier."
      />
      <SearchForm placeholder="Nom du document, client, référence…" defaultValue={term}>
        <FilterSelect name="category" defaultValue={sp.category} options={FILE_CATEGORIES} allLabel="Toutes catégories" />
      </SearchForm>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Aucun document trouvé" />
        ) : (
          <ul className="divide-y">
            {rows.map(({ f, dossierRef, agentId, clientRef, clientFirst, clientLast }) => {
              const allowed = canAccessFile(user, f, agentId)
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    {f.confidential ? <Lock className="size-4" /> : <FileText className="size-4" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {FILE_CATEGORIES[f.category as keyof typeof FILE_CATEGORIES]} · {formatDate(f.createdAt)}
                      {f.size ? ` · ${formatSize(f.size)}` : ''}
                    </span>
                  </div>
                  {clientRef && (
                    <Link href={`/clients/${f.clientId}`} className="text-sm hover:underline">
                      {clientFirst} {clientLast?.toUpperCase()}
                    </Link>
                  )}
                  {dossierRef && <RefTag href={`/dossiers/${f.dossierId}?tab=documents`}>{dossierRef}</RefTag>}
                  {f.confidential && <Pill tone="accent">Confidentiel</Pill>}
                  {allowed ? (
                    <div className="flex items-center gap-1">
                      <a
                        href={`/api/files/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Consulter ${f.name}`}
                      >
                        <Eye className="size-4" />
                      </a>
                      <a
                        href={`/api/files/${f.id}?download=1`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Télécharger ${f.name}`}
                      >
                        <Download className="size-4" />
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Accès restreint</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </>
  )
}
