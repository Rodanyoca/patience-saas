import Link from 'next/link'
import { Pencil } from 'lucide-react'
import type { clients, dossiers } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { setDossierStatus, updateDossier } from '@/app/actions/dossiers'
import { ActionButton, FormDialog } from '@/components/forms'
import { DossierFields } from '@/components/dossier-fields'
import { Pill, StatusPill } from '@/components/shared'
import { staffOptions } from '@/lib/queries'
import { DOSSIER_STATUS, type DossierStatus } from '@/lib/constants'
import { formatDate } from '@/lib/format'

type Dossier = typeof dossiers.$inferSelect
type Client = typeof clients.$inferSelect

export async function DossierTicket({
  dossier: d,
  client: c,
  agentName,
  user,
}: {
  dossier: Dossier
  client: Client
  agentName: string | null
  user: CurrentUser
}) {
  const staff = await staffOptions()
  const status = d.status as DossierStatus
  const open = status === 'en_attente' || status === 'en_cours'

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card md:flex-row" aria-label="Dossier">
      <div className="flex flex-1 flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">{d.reference}</span>
          <StatusPill status={d.status} label={DOSSIER_STATUS[status]} />
          {d.priority === 'urgente' && <Pill tone="accent">Urgent</Pill>}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{d.title}</h1>
          <p className="text-sm text-muted-foreground">
            Client :{' '}
            <Link href={`/clients/${c.id}`} className="font-medium text-foreground hover:underline">
              {c.firstName} {c.lastName.toUpperCase()}
            </Link>
            {c.phone && ` · ${c.phone}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormDialog
            title="Modifier le dossier"
            trigger={
              <>
                <Pencil /> Modifier
              </>
            }
            triggerVariant="outline"
            triggerSize="sm"
            action={updateDossier.bind(null, d.id)}
            success="Dossier mis à jour"
            wide
          >
            <DossierFields d={d} staff={staff} />
          </FormDialog>
          {status === 'en_attente' && (
            <ActionButton action={setDossierStatus.bind(null, d.id, 'en_cours')} success="Dossier en cours">
              Passer en cours
            </ActionButton>
          )}
          {open && (
            <ActionButton
              action={setDossierStatus.bind(null, d.id, 'termine')}
              confirm="Clôturer ce dossier ? Vérifiez au préalable la liste de contrôle (prestations, documents, paiements)."
              variant="default"
              success="Dossier clôturé"
            >
              Clôturer
            </ActionButton>
          )}
          {open && user.role !== 'agent' && (
            <ActionButton
              action={setDossierStatus.bind(null, d.id, 'annule')}
              confirm="Annuler ce dossier ?"
              variant="destructive"
              success="Dossier annulé"
            >
              Annuler
            </ActionButton>
          )}
          {!open && (
            <ActionButton action={setDossierStatus.bind(null, d.id, 'en_cours')} success="Dossier rouvert">
              Rouvrir
            </ActionButton>
          )}
        </div>
      </div>

      {/* Boarding-pass stub */}
      <div className="relative flex flex-col gap-4 border-t border-dashed bg-secondary/60 p-5 md:w-72 md:border-t-0 md:border-l md:p-6">
        <span aria-hidden className="absolute -top-2 -left-2 hidden size-4 rounded-full bg-background md:block" />
        <span aria-hidden className="absolute -bottom-2 -left-2 hidden size-4 rounded-full bg-background md:block" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Destination</span>
          <span className="text-lg font-semibold">{d.destination ?? '—'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Départ</span>
            <span className="font-mono text-sm">{formatDate(d.departureDate)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Retour</span>
            <span className="font-mono text-sm">{formatDate(d.returnDate)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Échéance</span>
            <span className="font-mono text-sm">{formatDate(d.dueDate)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Agent</span>
            <span className="truncate text-sm">{agentName ?? 'Non attribué'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
