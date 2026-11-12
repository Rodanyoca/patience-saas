import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { FileDown } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, commercialDocs, payments, dossiers } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import { EmptyState, FilterSelect, PageHeader, Panel, RefTag, SearchForm, StatusPill, TabLinks } from '@/components/shared'
import { INVOICE_STATUS, PAYMENT_METHODS, QUOTE_STATUS } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

export const metadata: Metadata = { title: 'Facturation' }

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; status?: string }>
}) {
  await requirePageUser()
  const sp = await searchParams
  const tab = sp.tab === 'devis' || sp.tab === 'paiements' ? sp.tab : 'factures'
  const term = sp.q?.trim()
  const like = term ? `%${term}%` : null

  const [totals] = await db
    .select({
      invoiced: sql<string>`coalesce(sum(${commercialDocs.total} * ${commercialDocs.rate}) filter (where ${commercialDocs.kind} = 'facture' and ${commercialDocs.status} <> 'annulee'), 0)`,
      openQuotes: sql<number>`count(*) filter (where ${commercialDocs.kind} = 'devis' and ${commercialDocs.status} in ('brouillon','envoye'))::int`,
      collected: sql<string>`(select coalesce(sum(${payments.amount} * ${payments.rate}),0) from ${payments})`,
    })
    .from(commercialDocs)
  const receivable = Number(totals.invoiced) - Number(totals.collected)

  return (
    <>
      <PageHeader title="Facturation et paiements" description="Devis, factures, encaissements et créances clients." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Total facturé', value: formatMoney(totals.invoiced) },
          { label: 'Total encaissé', value: formatMoney(totals.collected) },
          { label: 'Créances clients', value: formatMoney(receivable), alert: receivable > 0.01 },
        ].map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className={`font-mono text-xl font-semibold ${k.alert ? 'text-destructive' : ''}`}>{k.value}</span>
          </div>
        ))}
      </div>

      <TabLinks
        active={tab}
        tabs={[
          { key: 'factures', label: 'Factures', href: '/facturation' },
          { key: 'devis', label: 'Devis', href: '/facturation?tab=devis', count: totals.openQuotes },
          { key: 'paiements', label: 'Encaissements', href: '/facturation?tab=paiements' },
        ]}
      />

      <SearchForm placeholder="Numéro, client, dossier…" defaultValue={term}>
        <input type="hidden" name="tab" value={tab} />
        {tab === 'factures' && <FilterSelect name="status" defaultValue={sp.status} options={INVOICE_STATUS} allLabel="Tous statuts" />}
        {tab === 'devis' && <FilterSelect name="status" defaultValue={sp.status} options={QUOTE_STATUS} allLabel="Tous statuts" />}
        {tab === 'paiements' && <FilterSelect name="status" defaultValue={sp.status} options={PAYMENT_METHODS} allLabel="Tous modes" />}
      </SearchForm>

      {tab === 'paiements' ? <PaymentsTable like={like} method={sp.status} /> : <DocsTable kind={tab === 'devis' ? 'devis' : 'facture'} like={like} status={sp.status} />}
    </>
  )
}

async function DocsTable({ kind, like, status }: { kind: 'devis' | 'facture'; like: string | null; status?: string }) {
  const filters: SQL[] = [eq(commercialDocs.kind, kind)]
  if (status) filters.push(eq(commercialDocs.status, status))
  if (like) {
    filters.push(
      or(
        ilike(commercialDocs.number, like),
        ilike(dossiers.reference, like),
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
      )!,
    )
  }
  const rows = await db
    .select({
      d: commercialDocs,
      dossierRef: dossiers.reference,
      clientFirst: clients.firstName,
      clientLast: clients.lastName,
      paid: sql<string>`(select coalesce(sum(${payments.appliedAmount}),0) from ${payments} where ${payments.invoiceId} = ${commercialDocs.id})`,
    })
    .from(commercialDocs)
    .innerJoin(clients, eq(clients.id, commercialDocs.clientId))
    .innerJoin(dossiers, eq(dossiers.id, commercialDocs.dossierId))
    .where(and(...filters))
    .orderBy(desc(commercialDocs.createdAt))
    .limit(300)

  const labels = kind === 'devis' ? QUOTE_STATUS : INVOICE_STATUS
  return (
    <Panel>
      {rows.length === 0 ? (
        <EmptyState title={kind === 'devis' ? 'Aucun devis' : 'Aucune facture'}>
          Les documents commerciaux se créent depuis l’onglet « Devis et factures » d’un dossier.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Numéro</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Dossier</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                {kind === 'facture' && <th className="px-4 py-2.5 text-right font-medium">Solde</th>}
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ d, dossierRef, clientFirst, clientLast, paid }) => (
                <tr key={d.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <RefTag href={`/facturation/${d.id}`}>{d.number}</RefTag>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {clientFirst} {clientLast.toUpperCase()}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Link href={`/dossiers/${d.dossierId}`} className="font-mono text-xs hover:underline">
                      {dossierRef}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{formatDate(d.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(d.total, d.currency)}</td>
                  {kind === 'facture' && (
                    <td className="px-4 py-3 text-right font-mono">
                      {d.status === 'annulee' ? '—' : formatMoney(Number(d.total) - Number(paid), d.currency)}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} label={labels[d.status as keyof typeof labels]} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/api/pdf/doc/${d.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      aria-label={`Télécharger ${d.number} en PDF`}
                    >
                      <FileDown className="size-4" /> PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

async function PaymentsTable({ like, method }: { like: string | null; method?: string }) {
  const filters: SQL[] = []
  if (method) filters.push(eq(payments.method, method))
  if (like) {
    filters.push(
      or(
        ilike(payments.receiptNumber, like),
        ilike(commercialDocs.number, like),
        ilike(sql`${clients.firstName} || ' ' || ${clients.lastName}`, like),
      )!,
    )
  }
  const rows = await db
    .select({ p: payments, invoiceNumber: commercialDocs.number, clientFirst: clients.firstName, clientLast: clients.lastName })
    .from(payments)
    .innerJoin(commercialDocs, eq(commercialDocs.id, payments.invoiceId))
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(payments.paidAt), desc(payments.id))
    .limit(300)
  return (
    <Panel>
      {rows.length === 0 ? (
        <EmptyState title="Aucun encaissement" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reçu</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Facture</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Mode</th>
                <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ p, invoiceNumber, clientFirst, clientLast }) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <RefTag>{p.receiptNumber}</RefTag>
                  </td>
                  <td className="px-4 py-3">{formatDate(p.paidAt)}</td>
                  <td className="px-4 py-3 font-medium">
                    {clientFirst} {clientLast.toUpperCase()}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <Link href={`/facturation/${p.invoiceId}`} className="font-mono text-xs hover:underline">
                      {invoiceNumber}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/api/pdf/receipt/${p.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <FileDown className="size-4" /> Reçu
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
