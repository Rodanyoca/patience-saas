import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { FolderPlus, Pencil, Trash2, UserPlus } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, commercialDocs, dossiers, payments, travelers } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { addTraveler, deleteClient, deleteTraveler, updateClient, updateTraveler } from '@/app/actions/clients'
import { ActionButton, FormDialog } from '@/components/forms'
import { ClientFields, TravelerFields } from '@/components/client-fields'
import { DefinitionList, EmptyState, PageHeader, Panel, Pill, RefTag, StatusPill } from '@/components/shared'
import { FileList } from '@/components/file-list'
import { buttonVariants } from '@/components/ui/button'
import { DOSSIER_STATUS, TRAVELER_RELATIONS, type DossierStatus } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const [c] = await db.select().from(clients).where(eq(clients.id, Number(id)))
  return { title: c ? `${c.firstName} ${c.lastName}` : 'Client' }
}

function passportWarning(expiry: string | null) {
  if (!expiry) return null
  const months = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 0) return <Pill tone="danger">Expiré</Pill>
  if (months < 6) return <Pill tone="accent">{'Expire < 6 mois'}</Pill>
  return null
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const id = Number((await params).id)
  if (!id) notFound()
  const [c] = await db.select().from(clients).where(eq(clients.id, id))
  if (!c) notFound()

  const [travelerRows, dossierRows, [balance]] = await Promise.all([
    db.select().from(travelers).where(eq(travelers.clientId, id)).orderBy(asc(travelers.id)),
    db.select().from(dossiers).where(eq(dossiers.clientId, id)).orderBy(desc(dossiers.createdAt)),
    db
      .select({
        invoiced: sql<string>`coalesce(sum(${commercialDocs.total} * ${commercialDocs.rate}), 0)`,
        paid: sql<string>`coalesce((select sum(${payments.amount} * ${payments.rate}) from ${payments} where ${payments.clientId} = ${id}), 0)`,
      })
      .from(commercialDocs)
      .where(sql`${commercialDocs.clientId} = ${id} and ${commercialDocs.kind} = 'facture' and ${commercialDocs.status} <> 'annulee'`),
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
                confirm="Supprimer définitivement ce client et ses voyageurs ?"
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
        <Panel title="Coordonnées et identité" className="lg:col-span-2">
          <DefinitionList
            items={[
              { label: 'Téléphone', value: c.phone },
              { label: 'Email', value: c.email },
              { label: 'Adresse', value: [c.address, c.city, c.country].filter(Boolean).join(', ') },
              { label: 'Nationalité', value: c.nationality },
              { label: 'Date de naissance', value: c.birthDate ? formatDate(c.birthDate) : null },
              {
                label: 'Passeport',
                value: c.passportNumber ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{c.passportNumber}</span>
                    <span className="text-muted-foreground">exp. {formatDate(c.passportExpiry)}</span>
                    {passportWarning(c.passportExpiry)}
                  </span>
                ) : null,
              },
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

      <Panel
        title={`Voyageurs associés (${travelerRows.length})`}
        actions={
          <FormDialog
            title="Ajouter un voyageur"
            description="Membre de la famille, collègue ou accompagnant pouvant être rattaché aux dossiers."
            trigger={
              <>
                <UserPlus /> Ajouter
              </>
            }
            triggerVariant="outline"
            triggerSize="sm"
            action={addTraveler.bind(null, c.id)}
            success="Voyageur ajouté"
            wide
          >
            <TravelerFields />
          </FormDialog>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Voyageur</th>
                <th className="px-4 py-2 font-medium">Lien</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Naissance</th>
                <th className="px-4 py-2 font-medium">Passeport</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {travelerRows.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 font-medium">
                    {t.firstName} {t.lastName.toUpperCase()}
                  </td>
                  <td className="px-4 py-2.5">
                    {TRAVELER_RELATIONS[t.relation as keyof typeof TRAVELER_RELATIONS] ?? t.relation}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">{formatDate(t.birthDate)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{t.passportNumber ?? '—'}</span>
                      {passportWarning(t.passportExpiry)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <FormDialog
                        title="Modifier le voyageur"
                        trigger={<Pencil />}
                        triggerVariant="ghost"
                        triggerSize="icon-sm"
                        action={updateTraveler.bind(null, t.id)}
                        success="Voyageur mis à jour"
                        wide
                      >
                        <TravelerFields t={t} />
                      </FormDialog>
                      {t.relation !== 'titulaire' && (
                        <ActionButton
                          action={deleteTraveler.bind(null, t.id)}
                          confirm="Retirer ce voyageur de la fiche client ?"
                          variant="ghost"
                          size="icon-sm"
                          success="Voyageur retiré"
                        >
                          <Trash2 />
                          <span className="sr-only">Supprimer</span>
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

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

      <FileList user={user} clientId={c.id} />
    </>
  )
}
