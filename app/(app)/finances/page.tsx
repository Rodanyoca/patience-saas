import type { Metadata } from 'next'
import Link from 'next/link'
import { and, between, desc } from 'drizzle-orm'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { expenses } from '@/lib/db/schema'
import { MANAGERS, requirePageUser } from '@/lib/session'
import { createCashMovement, createExpense, deleteCashMovement, deleteExpense } from '@/app/actions/finance'
import {
  cashJournal,
  expensesByCategory,
  marginByDossier,
  marginByType,
  monthlyFlows,
  periodSummary,
  receivables,
  resolvePeriod,
  type Period,
} from '@/lib/reports'
import { currencyOptions } from '@/lib/queries'
import { ActionButton, Field, FormDialog, FormGrid, SelectField, TextArea } from '@/components/forms'
import { EmptyState, PageHeader, Panel, RefTag, TabLinks } from '@/components/shared'
import { PeriodForm } from '@/components/period-form'
import { FlowsChart, ShareChart } from '@/components/charts'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, SERVICE_TYPES, type ServiceType } from '@/lib/constants'
import { formatDate, formatMoney, todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Finances' }

const TABS = ['synthese', 'depenses', 'caisse', 'creances'] as const
type Tab = (typeof TABS)[number]

export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>
}) {
  await requirePageUser(MANAGERS)
  const sp = await searchParams
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'synthese'
  const period = resolvePeriod(sp)
  const qs = (t: string) => `/finances?tab=${t}&from=${period.from}&to=${period.to}`

  return (
    <>
      <PageHeader
        title="Gestion financière"
        description="Recettes, dépenses, caisse et rentabilité. Montants consolidés en USD au taux paramétré."
      />
      <TabLinks
        active={tab}
        tabs={[
          { key: 'synthese', label: 'Synthèse et marges', href: qs('synthese') },
          { key: 'depenses', label: 'Dépenses', href: qs('depenses') },
          { key: 'caisse', label: 'Caisse', href: qs('caisse') },
          { key: 'creances', label: 'Créances clients', href: qs('creances') },
        ]}
      />
      {tab !== 'creances' && (
        <PeriodForm
          from={period.from}
          to={period.to}
          hidden={{ tab }}
          exportHref={`/api/export?report=${tab}&from=${period.from}&to=${period.to}`}
        />
      )}
      {tab === 'synthese' && <Summary period={period} />}
      {tab === 'depenses' && <Expenses period={period} />}
      {tab === 'caisse' && <Cash period={period} />}
      {tab === 'creances' && <Receivables />}
    </>
  )
}

async function Summary({ period }: { period: Period }) {
  const [s, flows, byType, byDossier] = await Promise.all([
    periodSummary(period),
    monthlyFlows(period),
    marginByType(period),
    marginByDossier(period),
  ])
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Ventes facturées', value: s.invoiced },
          { label: 'Encaissements', value: s.collected },
          { label: 'Marge sur prestations', value: s.margin, hint: `${formatMoney(s.sales)} vendus − ${formatMoney(s.cost)} achetés` },
          { label: 'Résultat de trésorerie', value: s.net, hint: 'Encaissé − fournisseurs − dépenses', signed: true },
        ].map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className={`font-mono text-xl font-semibold ${k.signed && k.value < 0 ? 'text-destructive' : ''}`}>
              {formatMoney(k.value)}
            </span>
            {k.hint && <span className="text-xs text-muted-foreground">{k.hint}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Recettes et sorties par mois" className="lg:col-span-2" bodyClassName="p-4">
          <FlowsChart
            data={flows.map((f) => ({
              month: f.month,
              recettes: Number(f.recettes),
              sorties: Number(f.fournisseurs) + Number(f.depenses),
            }))}
          />
        </Panel>
        <Panel title="État des recettes et dépenses">
          <dl className="flex flex-col gap-2 p-4 text-sm">
            {[
              ['Encaissements clients', s.collected],
              ['Paiements fournisseurs', -s.supplierPaid],
              ['Dépenses de fonctionnement', -s.expenses],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{l}</dt>
                <dd className="font-mono">{formatMoney(v as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <dt>Solde</dt>
              <dd className="font-mono">{formatMoney(s.net)}</dd>
            </div>
          </dl>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Marge par type de prestation">
          {byType.length === 0 ? (
            <EmptyState title="Aucune prestation sur la période" />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Prestation</th>
                  <th className="px-4 py-2 text-right font-medium">Nb</th>
                  <th className="px-4 py-2 text-right font-medium">Ventes</th>
                  <th className="px-4 py-2 text-right font-medium">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byType.map((r) => {
                  const m = Number(r.sales) - Number(r.cost)
                  const pct = Number(r.sales) > 0 ? (m / Number(r.sales)) * 100 : 0
                  return (
                    <tr key={r.type}>
                      <td className="px-4 py-2.5">{r.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatMoney(r.sales)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {formatMoney(m)} <span className="text-xs text-muted-foreground">({pct.toFixed(0)} %)</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Marge par dossier">
          {byDossier.length === 0 ? (
            <EmptyState title="Aucun dossier sur la période" />
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {byDossier.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <RefTag href={`/dossiers/${d.id}`}>{d.reference}</RefTag>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.client}</span>
                  <span className="font-mono">{formatMoney(Number(d.sales) - Number(d.cost))}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}

async function Expenses({ period }: { period: Period }) {
  const [rows, byCat, currencies] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(and(between(expenses.paidAt, period.from, period.to)))
      .orderBy(desc(expenses.paidAt), desc(expenses.id)),
    expensesByCategory(period),
    currencyOptions(),
  ])
  const total = byCat.reduce((a, c) => a + Number(c.total), 0)
  return (
    <>
      <div className="flex justify-end">
        <FormDialog
          title="Nouvelle dépense"
          trigger={
            <>
              <Plus /> Enregistrer une dépense
            </>
          }
          action={createExpense}
          success="Dépense enregistrée"
        >
          <Field label="Libellé" name="label" required placeholder="Ex. Loyer novembre" />
          <FormGrid>
            <SelectField label="Catégorie" name="category" options={EXPENSE_CATEGORIES} defaultValue="loyer" />
            <Field label="Date" name="paidAt" type="date" defaultValue={todayISO()} />
            <Field label="Montant" name="amount" type="number" required />
            <SelectField label="Devise" name="currency" options={currencies} defaultValue="USD" />
            <SelectField label="Mode de paiement" name="method" options={PAYMENT_METHODS} defaultValue="especes" />
          </FormGrid>
          <TextArea label="Note" name="notes" rows={2} />
        </FormDialog>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title={`Dépenses (${rows.length})`} className="lg:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="Aucune dépense sur la période" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Libellé</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Catégorie</th>
                    <th className="px-4 py-2 text-right font-medium">Montant</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.paidAt)}</td>
                      <td className="px-4 py-2.5">
                        {e.label}
                        <span className="block text-xs text-muted-foreground">
                          {PAYMENT_METHODS[e.method as keyof typeof PAYMENT_METHODS]}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        {EXPENSE_CATEGORIES[e.category as keyof typeof EXPENSE_CATEGORIES]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatMoney(e.amount, e.currency)}</td>
                      <td className="px-2 py-2.5">
                        <ActionButton
                          action={deleteExpense.bind(null, e.id)}
                          confirm="Supprimer cette dépense ?"
                          variant="ghost"
                          size="icon-sm"
                          success="Dépense supprimée"
                        >
                          <Trash2 />
                          <span className="sr-only">Supprimer</span>
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Répartition">
          {byCat.length === 0 ? (
            <EmptyState title="—" />
          ) : (
            <div className="flex flex-col gap-2 p-4">
              <ShareChart
                data={byCat.map((c) => ({
                  key: c.category,
                  label: EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES],
                  value: Math.round(Number(c.total) * 100) / 100,
                }))}
              />
              <ul className="flex flex-col gap-1.5 text-sm">
                {byCat.map((c) => (
                  <li key={c.category} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES]}</span>
                    <span className="font-mono">{formatMoney(c.total)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{formatMoney(total)}</span>
                </li>
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

async function Cash({ period }: { period: Period }) {
  const [{ opening, lines }, currencies] = await Promise.all([cashJournal(period), currencyOptions()])
  let running = opening
  const withBalance = lines.map((l) => {
    running += l.direction === 'entree' ? Number(l.base) : -Number(l.base)
    return { ...l, balance: running }
  })
  const movementForm = (direction: 'entree' | 'sortie') => (
    <FormDialog
      title={direction === 'entree' ? 'Entrée de caisse' : 'Sortie de caisse'}
      description="Apport, retrait, dépôt en banque, fonds de caisse…"
      trigger={
        <>
          {direction === 'entree' ? <Plus /> : <Minus />} {direction === 'entree' ? 'Entrée' : 'Sortie'}
        </>
      }
      triggerVariant={direction === 'entree' ? 'default' : 'outline'}
      action={createCashMovement}
      success="Mouvement enregistré"
    >
      <input type="hidden" name="direction" value={direction} />
      <Field label="Libellé" name="label" required />
      <FormGrid>
        <Field label="Montant" name="amount" type="number" required />
        <SelectField label="Devise" name="currency" options={currencies} defaultValue="USD" />
        <Field label="Date" name="occurredAt" type="date" defaultValue={todayISO()} />
      </FormGrid>
      <TextArea label="Note" name="notes" rows={2} />
    </FormDialog>
  )
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Solde d’ouverture</span>
            <span className="font-mono text-lg">{formatMoney(opening)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Solde de clôture</span>
            <span className="font-mono text-lg font-semibold">{formatMoney(running)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {movementForm('entree')}
          {movementForm('sortie')}
        </div>
      </div>
      <Panel title="Journal de caisse (espèces)">
        {withBalance.length === 0 ? (
          <EmptyState title="Aucun mouvement en espèces sur la période" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Opération</th>
                  <th className="px-4 py-2 text-right font-medium">Entrée</th>
                  <th className="px-4 py-2 text-right font-medium">Sortie</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Solde (USD)</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {withBalance.map((l) => (
                  <tr key={`${l.source}-${l.source_id}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(l.date)}</td>
                    <td className="px-4 py-2.5">
                      {l.label}
                      <span className="block text-xs text-muted-foreground">{l.kind}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.direction === 'entree' ? formatMoney(l.amount, l.currency) : ''}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.direction === 'sortie' ? formatMoney(l.amount, l.currency) : ''}</td>
                    <td className="hidden px-4 py-2.5 text-right font-mono sm:table-cell">{formatMoney(l.balance)}</td>
                    <td className="px-2 py-2.5">
                      {l.source === 'cash' && (
                        <ActionButton
                          action={deleteCashMovement.bind(null, l.source_id)}
                          confirm="Supprimer ce mouvement de caisse ?"
                          variant="ghost"
                          size="icon-sm"
                          success="Mouvement supprimé"
                        >
                          <Trash2 />
                          <span className="sr-only">Supprimer</span>
                        </ActionButton>
                      )}
                    </td>
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

async function Receivables() {
  const rows = await receivables()
  const today = todayISO()
  return (
    <>
      <div className="flex justify-end">
        <a href="/api/export?report=creances" className="text-sm font-medium text-primary hover:underline">
          Exporter Excel
        </a>
      </div>
      <Panel title="Factures non soldées">
        {rows.length === 0 ? (
          <EmptyState title="Aucune créance en cours" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Facture</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Échéance</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Reste dû</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const late = r.due_date && r.due_date < today
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5">
                        <RefTag href={`/facturation/${r.id}`}>{r.number}</RefTag>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/clients/${r.client_id}`} className="hover:underline">
                          {r.client}
                        </Link>
                      </td>
                      <td className={`px-4 py-2.5 ${late ? 'font-medium text-destructive' : ''}`}>
                        {formatDate(r.due_date)}
                        {late && ' · en retard'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatMoney(r.total, r.currency)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">
                        {formatMoney(Number(r.total) - Number(r.paid), r.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
