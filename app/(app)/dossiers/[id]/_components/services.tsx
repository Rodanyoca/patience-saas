import { asc, eq } from 'drizzle-orm'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { services, suppliers } from '@/lib/db/schema'
import type { CurrentUser } from '@/lib/session'
import { addService, deleteService, updateService } from '@/app/actions/dossiers'
import { ActionButton } from '@/components/forms'
import { ServiceFormDialog } from '@/components/service-form'
import { EmptyState, Panel, StatusPill } from '@/components/shared'
import { currencyOptions, supplierOptions } from '@/lib/queries'
import { getSettings } from '@/lib/server-utils'
import { SERVICE_FIELDS, SERVICE_STATUS, SERVICE_TYPES, type ServiceType } from '@/lib/constants'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'

function formatDetail(value: string, type?: string, options?: Record<string, string>) {
  if (options) return options[value] ?? value
  if (type === 'date') return formatDate(value)
  if (type === 'datetime-local') return formatDateTime(value)
  return value
}

export async function ServicesTab({ dossierId, user }: { dossierId: number; user: CurrentUser }) {
  const [rows, supplierOpts, currencies, settings] = await Promise.all([
    db
      .select({ s: services, supplierName: suppliers.name })
      .from(services)
      .leftJoin(suppliers, eq(suppliers.id, services.supplierId))
      .where(eq(services.dossierId, dossierId))
      .orderBy(asc(services.createdAt)),
    supplierOptions(),
    currencyOptions(),
    getSettings(),
  ])

  const add = (
    <ServiceFormDialog
      action={addService.bind(null, dossierId)}
      suppliers={supplierOpts}
      currencies={currencies}
      defaultCurrency={settings.defaultCurrency}
      trigger={
        <>
          <Plus /> Ajouter une prestation
        </>
      }
    />
  )

  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState title="Aucune prestation">
          Ajoutez un visa, un billet d’avion, une réservation d’hôtel ou une assurance à ce dossier.
        </EmptyState>
        <div className="flex justify-center pb-8">{add}</div>
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{add}</div>
      {rows.map(({ s, supplierName }) => {
        const type = s.type as ServiceType
        const margin = Number(s.salePrice) - Number(s.costPrice)
        const detailItems = SERVICE_FIELDS[type].filter((f) => s.details?.[f.name])
        return (
          <Panel
            key={s.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{SERVICE_TYPES[type]}</span>
                <span>{s.description}</span>
              </span>
            }
            actions={
              <>
                <StatusPill status={s.status} label={SERVICE_STATUS[type][s.status]} />
                <ServiceFormDialog
                  action={updateService.bind(null, s.id)}
                  suppliers={supplierOpts}
                  currencies={currencies}
                  service={s}
                  trigger={
                    <>
                      <Pencil />
                      <span className="sr-only">Modifier</span>
                    </>
                  }
                  triggerVariant="ghost"
                  triggerSize="icon-sm"
                />
                {user.role !== 'agent' && (
                  <ActionButton
                    action={deleteService.bind(null, s.id)}
                    confirm="Supprimer cette prestation ?"
                    variant="ghost"
                    size="icon-sm"
                    success="Prestation supprimée"
                  >
                    <Trash2 />
                    <span className="sr-only">Supprimer</span>
                  </ActionButton>
                )}
              </>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2 md:col-span-2">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Fournisseur</dt>
                  <dd className="text-sm">{supplierName ?? '—'}</dd>
                </div>
                {detailItems.map((f) => (
                  <div key={f.name} className={`flex min-w-0 flex-col gap-0.5 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd
                      className={`whitespace-pre-line break-words text-sm ${
                        ['pnr', 'ticketNumbers', 'policyNumber', 'confirmationRef'].includes(f.name) ? 'font-mono' : ''
                      }`}
                    >
                      {formatDetail(s.details[f.name], f.type, f.options)}
                    </dd>
                  </div>
                ))}
              </dl>
              <dl className="flex flex-col gap-2 border-t bg-muted/30 p-4 md:border-t-0 md:border-l">
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Coût d’achat</dt>
                  <dd className="font-mono">{formatMoney(s.costPrice, s.currency)}</dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Prix de vente</dt>
                  <dd className="font-mono">{formatMoney(s.salePrice, s.currency)}</dd>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <dt className="font-medium">Marge</dt>
                  <dd className={`font-mono font-semibold ${margin < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(margin, s.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
