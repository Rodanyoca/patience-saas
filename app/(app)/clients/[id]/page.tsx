import { and } from 'drizzle-orm'
import { branchScope } from '@/lib/branches'
import { commercialScope } from '@/lib/commercial-scope'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq, sql } from 'drizzle-orm'
import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, commercialDocs, dossiers, payments } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { deleteClient, updateClient } from '@/app/actions/clients'
import { ActionButton, FormDialog } from '@/components/forms'
import { ClientFields } from '@/components/client-fields'
import { DefinitionList, EmptyState, PageHeader, Panel, RefTag, StatusPill } from '@/components/shared'
import { buttonVariants } from '@/components/ui/button'
import { DOSSIER_STATUS, type DossierStatus } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const [c] = await db.select().from(clients).where(eq(clients.id, Number(id)))
  return { title: c ? `${c.firstName} ${c.lastName}` : 'Client' }
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const id = Number((await params).id)
  if (!id) notFound()
  const [c] = await db.select().from(clients).where(eq(clients.id, id))
  if (!c) notFound()

  const [dossierRows, [balance]] = await Promise.all([
    db.select().from(dossiers).where(and(eq(dossiers.clientId,id),branchScope(dossiers.branchId,user))).orderBy(desc(dossiers.createdAt)),
    db
      .select({
        invoiced: sql<string>`coalesce(sum(${commercialDocs.total} * ${commercialDocs.rate}), 0)`,
        paid: sql<string>`coalesce((select sum(${payments.amount} * ${payments.rate}) from ${payments} where ${payments.clientId} = ${id}), 0)`,
      })
      .from(commercialDocs)
      .where(sql`${commercialDocs.clientId} = ${id} and ${commercialDocs.kind} = 'facture' and ${commercialScope(user)} and ${commercialDocs.status} <> 'annulee'`),
  ])
  const due = Number(balance.invoiced) - Number(balance.paid)
  const isManager = user.role !== 'agent'

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/clients" className="hover:underline">
            Clients
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.firstName} {c.lastName.toUpperCase()}
            <RefTag>{c.reference}</RefTag>
          </span>
        }
        description={c.type === 'entreprise' ? c.companyName : undefined}
        actions={
          <>
            <Link href={`/dossiers/new?client=${c.id}`} className={buttonVariants()}>
              <FolderPlus /> Nouveau dossier
            </Link>
            <FormDialog
              title="Modifier le client"
              trigger={
                <>
                  <Pencil /> Modifier
                </>
              }
              triggerVariant="outline"
              action={updateClient.bind(null, c.id)}
              success="Client mis à jour"
              wide
            >
              <ClientFields c={c} />
            </FormDialog>
            {isManager && dossierRows.length === 0 && (
              <ActionButton
                action={deleteClient.bind(null, c.id)}
                confirm="Supprimer définitivement ce client ?"
                variant="destructive"
                size="default"
                success="Client supprimé"
                redirectTo="/clients"
              >
                <Trash2 /> Supprimer
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Informations du client" className="lg:col-span-2">
          <DefinitionList
            items={[
              { label: 'Téléphone', value: c.phone },
              { label: 'Email', value: c.email },
              { label: 'Adresse', value: [c.address, c.city, c.country].filter(Boolean).join(', ') },
              { label: 'Notes', value: c.notes },
              { label: 'Client depuis', value: formatDate(c.createdAt) },
            ]}
          />
        </Panel>
        <Panel title="Situation financière">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Total facturé</span>
              <span className="font-mono text-lg">{formatMoney(balance.invoiced)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Total encaissé</span>
              <span className="font-mono text-lg">{formatMoney(balance.paid)}</span>
            </div>
            <div className="flex flex-col gap-0.5 border-t pt-4">
              <span className="text-xs text-muted-foreground">Solde restant dû</span>
              <span className={`font-mono text-2xl font-semibold ${due > 0.005 ? 'text-destructive' : ''}`}>
                {formatMoney(due)}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title={`Historique des dossiers (${dossierRows.length})`}>
        {dossierRows.length === 0 ? (
          <EmptyState title="Aucun dossier">Ouvrez un dossier pour enregistrer une demande de ce client.</EmptyState>
        ) : (
          <ul className="divide-y">
            {dossierRows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <RefTag href={`/dossiers/${d.id}`}>{d.reference}</RefTag>
                <Link href={`/dossiers/${d.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {d.title}
                  {d.destination && <span className="font-normal text-muted-foreground"> — {d.destination}</span>}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {d.departureDate ? `Départ ${formatDate(d.departureDate)}` : formatDate(d.createdAt)}
                </span>
                <StatusPill status={d.status} label={DOSSIER_STATUS[d.status as DossierStatus]} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

    </>
  )
}
