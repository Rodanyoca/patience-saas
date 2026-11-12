import type { Metadata } from 'next'
import Link from 'next/link'
import { desc, ilike, or, sql, eq } from 'drizzle-orm'
import { Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, dossiers } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { createClient } from '@/app/actions/clients'
import { EmptyState, PageHeader, Panel, Pill, RefTag, SearchForm } from '@/components/shared'
import { FormDialog } from '@/components/forms'
import { ClientFields } from '@/components/client-fields'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Clients' }

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePageUser()
  const { q } = await searchParams
  const term = q?.trim()
  const like = term ? `%${term}%` : null

  const rows = await db
    .select({
      id: clients.id,
      reference: clients.reference,
      type: clients.type,
      firstName: clients.firstName,
      lastName: clients.lastName,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
      city: clients.city,
      createdAt: clients.createdAt,
      dossierCount: sql<number>`(select count(*)::int from ${dossiers} where ${dossiers.clientId} = ${clients.id})`,
    })
    .from(clients)
    .where(
      like
        ? or(
            ilike(clients.firstName, like),
            ilike(clients.lastName, like),
            ilike(clients.companyName, like),
            ilike(clients.phone, like),
            ilike(clients.email, like),
            ilike(clients.reference, like),
            ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
            ilike(clients.passportNumber, like),
          )
        : undefined,
    )
    .orderBy(desc(clients.createdAt))
    .limit(200)

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(clients)

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${total} client${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''} — registre unique pour éviter les doublons.`}
        actions={
          <FormDialog
            title="Nouveau client"
            description="Le client est automatiquement enregistré comme voyageur titulaire."
            trigger={
              <>
                <Plus /> Nouveau client
              </>
            }
            action={createClient}
            success="Client créé"
            wide
            redirectTo="/clients/{id}"
          >
            <ClientFields />
          </FormDialog>
        }
      />
      <SearchForm placeholder="Nom, téléphone, email, référence, passeport…" defaultValue={term} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title={term ? 'Aucun client trouvé' : 'Aucun client pour le moment'}>
            {term ? 'Essayez un autre terme de recherche.' : 'Ajoutez votre premier client pour ouvrir un dossier.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Référence</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Contact</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Ville</th>
                  <th className="px-4 py-2.5 text-right font-medium">Dossiers</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Depuis</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <RefTag href={`/clients/${c.id}`}>{c.reference}</RefTag>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                        {c.firstName} {c.lastName.toUpperCase()}
                      </Link>
                      {c.type === 'entreprise' && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Pill>Entreprise</Pill> {c.companyName}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div>{c.phone ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.dossierCount}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatDate(c.createdAt)}</td>
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
