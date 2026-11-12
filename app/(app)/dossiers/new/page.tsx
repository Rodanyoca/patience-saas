import type { Metadata } from 'next'
import Link from 'next/link'
import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, travelers } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { staffOptions } from '@/lib/queries'
import { createDossier, } from '@/app/actions/dossiers'
import { createClient } from '@/app/actions/clients'
import { EmptyState, PageHeader, Panel, RefTag, SearchForm } from '@/components/shared'
import { DossierFields } from '@/components/dossier-fields'
import { FormDialog, InlineForm } from '@/components/forms'
import { ClientFields } from '@/components/client-fields'
import { TRAVELER_RELATIONS } from '@/lib/constants'

export const metadata: Metadata = { title: 'Nouveau dossier' }

export default async function NewDossierPage({ searchParams }: { searchParams: Promise<{ client?: string; q?: string }> }) {
  const me = await requirePageUser()
  const sp = await searchParams
  const clientId = Number(sp.client)

  if (!clientId) {
    const term = sp.q?.trim()
    const like = term ? `%${term}%` : null
    const rows = await db
      .select()
      .from(clients)
      .where(
        like
          ? or(
              ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
              ilike(clients.phone, like),
              ilike(clients.reference, like),
              ilike(clients.email, like),
            )
          : undefined,
      )
      .orderBy(desc(clients.updatedAt))
      .limit(30)
    return (
      <>
        <PageHeader
          eyebrow={
            <Link href="/dossiers" className="hover:underline">
              Dossiers
            </Link>
          }
          title="Nouveau dossier"
          description="Étape 1 — Identifiez le client : recherchez une fiche existante ou créez-en une."
          actions={
            <FormDialog
              title="Nouveau client"
              trigger="Créer un client"
              triggerVariant="outline"
              action={createClient}
              success="Client créé"
              wide
              redirectTo="/dossiers/new?client={id}"
            >
              <ClientFields />
            </FormDialog>
          }
        />
        <SearchForm placeholder="Nom, téléphone, référence…" defaultValue={term} />
        <Panel>
          {rows.length === 0 ? (
            <EmptyState title="Aucun client trouvé">Créez une nouvelle fiche client pour continuer.</EmptyState>
          ) : (
            <ul className="divide-y">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dossiers/new?client=${c.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50"
                  >
                    <RefTag>{c.reference}</RefTag>
                    <span className="flex-1 font-medium">
                      {c.firstName} {c.lastName.toUpperCase()}
                    </span>
                    <span className="text-sm text-muted-foreground">{c.phone}</span>
                    <span className="text-sm font-medium text-primary">Sélectionner</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </>
    )
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId))
  if (!client) return <EmptyState title="Client introuvable" />
  const [travelerRows, staff] = await Promise.all([
    db.select().from(travelers).where(eq(travelers.clientId, clientId)).orderBy(asc(travelers.id)),
    staffOptions(),
  ])

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/dossiers/new" className="hover:underline">
            Changer de client
          </Link>
        }
        title="Nouveau dossier"
        description={
          <>
            Étape 2 — Ouverture du dossier pour{' '}
            <strong className="text-foreground">
              {client.firstName} {client.lastName.toUpperCase()}
            </strong>{' '}
            ({client.reference}).
          </>
        }
      />
      <Panel>
        <InlineForm
          action={createDossier}
          submitLabel="Ouvrir le dossier"
          success="Dossier ouvert"
          className="p-4 md:p-6"
          redirectTo="/dossiers/{id}?tab=prestations"
        >
          <input type="hidden" name="clientId" value={client.id} />
          <DossierFields staff={staff} defaultAgent={me.id} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">Voyageurs concernés</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {travelerRows.map((t) => (
                <label key={t.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                  <input type="checkbox" name="travelerIds" value={t.id} defaultChecked className="size-4 accent-primary" />
                  <span className="flex-1">
                    {t.firstName} {t.lastName.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {TRAVELER_RELATIONS[t.relation as keyof typeof TRAVELER_RELATIONS]}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              D’autres voyageurs peuvent être ajoutés depuis la{' '}
              <Link href={`/clients/${client.id}`} className="underline">
                fiche client
              </Link>
              .
            </p>
          </fieldset>
        </InlineForm>
      </Panel>
    </>
  )
}
