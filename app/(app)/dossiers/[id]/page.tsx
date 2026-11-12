import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, commercialDocs, dossiers, files, services, user as users } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { TabLinks } from '@/components/shared'
import { FileList } from '@/components/file-list'
import { DossierTicket } from './_components/ticket'
import { OverviewTab } from './_components/overview'
import { ServicesTab } from './_components/services'
import { BillingTab } from './_components/billing'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const [d] = await db.select({ reference: dossiers.reference }).from(dossiers).where(eq(dossiers.id, Number(id)))
  return { title: d?.reference ?? 'Dossier' }
}

export default async function DossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await requirePageUser()
  const id = Number((await params).id)
  const { tab = 'apercu' } = await searchParams
  if (!id) notFound()

  const [row] = await db
    .select({ d: dossiers, c: clients, agentName: users.name })
    .from(dossiers)
    .innerJoin(clients, eq(clients.id, dossiers.clientId))
    .leftJoin(users, eq(users.id, dossiers.agentId))
    .where(eq(dossiers.id, id))
  if (!row) notFound()

  const [[counts]] = await Promise.all([
    db
      .select({
        services: sql<number>`(select count(*)::int from ${services} where ${services.dossierId} = ${id})`,
        docs: sql<number>`(select count(*)::int from ${commercialDocs} where ${commercialDocs.dossierId} = ${id})`,
        files: sql<number>`(select count(*)::int from ${files} where ${files.dossierId} = ${id})`,
      })
      .from(sql`(select 1) as x`),
  ])

  const base = `/dossiers/${id}`
  return (
    <>
      <div className="text-xs text-muted-foreground">
        <Link href="/dossiers" className="hover:underline">
          Dossiers
        </Link>{' '}
        / {row.d.reference}
      </div>
      <DossierTicket dossier={row.d} client={row.c} agentName={row.agentName} user={user} />
      <TabLinks
        active={tab}
        tabs={[
          { key: 'apercu', label: 'Aperçu', href: base },
          { key: 'prestations', label: 'Prestations', href: `${base}?tab=prestations`, count: counts.services },
          { key: 'facturation', label: 'Devis et factures', href: `${base}?tab=facturation`, count: counts.docs },
          { key: 'documents', label: 'Documents', href: `${base}?tab=documents`, count: counts.files },
        ]}
      />
      {tab === 'prestations' && <ServicesTab dossierId={id} user={user} />}
      {tab === 'facturation' && <BillingTab dossierId={id} />}
      {tab === 'documents' && <FileList user={user} dossierId={id} clientId={row.c.id} agentId={row.d.agentId} />}
      {tab === 'apercu' && <OverviewTab dossier={row.d} client={row.c} user={user} />}
    </>
  )
}
