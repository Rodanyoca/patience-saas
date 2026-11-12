import { asc, desc, eq, sql } from 'drizzle-orm'
import { Check, Circle, Users } from 'lucide-react'
import { db } from '@/lib/db'
import {
  clients,
  commercialDocs,
  dossierSteps,
  dossierTravelers,
  dossiers,
  files,
  payments,
  services,
  travelers,
} from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { addDossierNote, setDossierTravelers } from '@/app/actions/dossiers'
import { Field, FormDialog, InlineForm, TextArea } from '@/components/forms'
import { DefinitionList, Panel } from '@/components/shared'
import { TRAVELER_RELATIONS } from '@/lib/constants'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

type Dossier = typeof dossiers.$inferSelect
type Client = typeof clients.$inferSelect

export async function OverviewTab({ dossier: d, client: c }: { dossier: Dossier; client: Client; user: CurrentUser }) {
  const [linked, allTravelers, steps, [stats]] = await Promise.all([
    db
      .select({ t: travelers })
      .from(dossierTravelers)
      .innerJoin(travelers, eq(travelers.id, dossierTravelers.travelerId))
      .where(eq(dossierTravelers.dossierId, d.id))
      .orderBy(asc(travelers.id)),
    db.select().from(travelers).where(eq(travelers.clientId, c.id)).orderBy(asc(travelers.id)),
    db.select().from(dossierSteps).where(eq(dossierSteps.dossierId, d.id)).orderBy(desc(dossierSteps.createdAt)),
    db
      .select({
        services: sql<number>`(select count(*)::int from ${services} where ${services.dossierId} = ${d.id} and ${services.status} <> 'annule')`,
        pendingServices: sql<number>`(select count(*)::int from ${services} where ${services.dossierId} = ${d.id} and ${services.status} not in ('emis','confirme','souscrit','accorde','refuse','annule'))`,
        files: sql<number>`(select count(*)::int from ${files} where ${files.dossierId} = ${d.id})`,
        invoiced: sql<string>`(select coalesce(sum(${commercialDocs.total} * ${commercialDocs.rate}),0) from ${commercialDocs} where ${commercialDocs.dossierId} = ${d.id} and ${commercialDocs.kind} = 'facture' and ${commercialDocs.status} <> 'annulee')`,
        paid: sql<string>`(select coalesce(sum(${payments.amount} * ${payments.rate}),0) from ${payments} where ${payments.dossierId} = ${d.id})`,
        sale: sql<string>`(select coalesce(sum(${services.salePrice} * ${services.rate}),0) from ${services} where ${services.dossierId} = ${d.id} and ${services.status} <> 'annule')`,
        cost: sql<string>`(select coalesce(sum(${services.costPrice} * ${services.rate}),0) from ${services} where ${services.dossierId} = ${d.id} and ${services.status} <> 'annule')`,
      })
      .from(sql`(select 1) as x`),
  ])

  const due = Number(stats.invoiced) - Number(stats.paid)
  const uninvoiced = Number(stats.sale) - Number(stats.invoiced)
  const margin = Number(stats.sale) - Number(stats.cost)
  const linkedIds = new Set(linked.map((l) => l.t.id))

  const checklist = [
    { ok: linked.length > 0, label: 'Voyageurs identifiés' },
    { ok: stats.services > 0, label: 'Prestations enregistrées' },
    { ok: stats.services > 0 && stats.pendingServices === 0, label: 'Prestations confirmées / émises' },
    { ok: stats.files > 0, label: 'Documents archivés' },
    { ok: stats.services > 0 && uninvoiced <= 0.01, label: 'Prestations facturées' },
    { ok: Number(stats.invoiced) > 0 && due <= 0.01, label: 'Paiements soldés' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <Panel title="Synthèse financière (USD)">
          <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'Prix de vente', value: formatMoney(stats.sale) },
              { label: 'Coût fournisseurs', value: formatMoney(stats.cost) },
              { label: 'Marge', value: formatMoney(margin) },
              { label: 'Reste à encaisser', value: formatMoney(due), strong: due > 0.01 },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 p-4">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className={cn('font-mono text-base', s.strong && 'font-semibold text-destructive')}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          title={`Voyageurs (${linked.length})`}
          actions={
            <FormDialog
              title="Voyageurs du dossier"
              description="Sélectionnez les voyageurs de la fiche client concernés par ce dossier."
              trigger={
                <>
                  <Users /> Gérer
                </>
              }
              triggerVariant="outline"
              triggerSize="sm"
              action={setDossierTravelers.bind(null, d.id)}
              success="Voyageurs mis à jour"
            >
              <div className="flex flex-col gap-2">
                {allTravelers.map((t) => (
                  <label key={t.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name="travelerIds"
                      value={t.id}
                      defaultChecked={linkedIds.has(t.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="flex-1">
                      {t.firstName} {t.lastName.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TRAVELER_RELATIONS[t.relation as keyof typeof TRAVELER_RELATIONS]}
                    </span>
                  </label>
                ))}
              </div>
            </FormDialog>
          }
        >
          {linked.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucun voyageur rattaché.</p>
          ) : (
            <ul className="divide-y">
              {linked.map(({ t }) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-40 flex-1 font-medium">
                    {t.firstName} {t.lastName.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">{formatDate(t.birthDate)}</span>
                  <span className="font-mono text-xs">{t.passportNumber ?? 'Passeport non renseigné'}</span>
                  {t.passportExpiry && <span className="text-xs text-muted-foreground">exp. {formatDate(t.passportExpiry)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Informations">
          <DefinitionList
            items={[
              { label: 'Ouvert le', value: formatDateTime(d.createdAt) },
              { label: 'Dernière mise à jour', value: formatDateTime(d.updatedAt) },
              { label: 'Clôturé le', value: d.closedAt ? formatDateTime(d.closedAt) : null },
              { label: 'Observations', value: d.notes },
            ]}
          />
        </Panel>
      </div>

      <div className="flex flex-col gap-6">
        <Panel title="Contrôle avant clôture">
          <ul className="flex flex-col gap-2 p-4">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm">
                {item.ok ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                ) : (
                  <Circle className="size-5 text-muted-foreground/50" />
                )}
                <span className={item.ok ? '' : 'text-muted-foreground'}>{item.label}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Suivi et étapes">
          <div className="border-b p-4">
            <InlineForm action={addDossierNote.bind(null, d.id)} submitLabel="Ajouter" success="Étape ajoutée" resetOnSuccess>
              <Field label="Étape / observation" name="label" required placeholder="Ex. Client relancé pour pièces" />
              <TextArea label="Détail (facultatif)" name="note" rows={2} />
            </InlineForm>
          </div>
          <ol className="flex flex-col p-4">
            {steps.map((s, i) => (
              <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span aria-hidden className="absolute top-3 left-[5px] h-full w-px bg-border" />}
                <span aria-hidden className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-primary bg-card" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{s.label}</span>
                  {s.note && <span className="text-sm leading-relaxed text-muted-foreground">{s.note}</span>}
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(s.createdAt)} · {s.userName}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
