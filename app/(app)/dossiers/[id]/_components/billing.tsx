import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { commercialDocs, payments } from '@/lib/db/schema'
import { createInvoice, createQuote } from '@/app/actions/billing'
import { ActionButton } from '@/components/forms'
import { EmptyState, Panel, RefTag, StatusPill } from '@/components/shared'
import { INVOICE_STATUS, QUOTE_STATUS } from '@/lib/constants'
import { formatDate, formatMoney } from '@/lib/format'

export async function BillingTab({ dossierId }: { dossierId: number }) {
  const docs = await db
    .select({
      d: commercialDocs,
      paid: sql<string>`(select coalesce(sum(${payments.appliedAmount}),0) from ${payments} where ${payments.invoiceId} = ${commercialDocs.id})`,
    })
    .from(commercialDocs)
    .where(eq(commercialDocs.dossierId, dossierId))
    .orderBy(desc(commercialDocs.createdAt))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton action={createQuote.bind(null, dossierId)} success="Devis créé" size="default">
          Établir un devis
        </ActionButton>
        <ActionButton action={createInvoice.bind(null, dossierId)} variant="default" size="default" success="Facture créée">
          Facturer les prestations
        </ActionButton>
      </div>
      <Panel>
        {docs.length === 0 ? (
          <EmptyState title="Aucun document commercial">
            Le devis et la facture sont générés à partir des prestations du dossier. Vous pourrez ensuite ajuster les lignes.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Numéro</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Solde</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {docs.map(({ d, paid }) => {
                  const balance = Number(d.total) - Number(paid)
                  return (
                    <tr key={d.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <RefTag href={`/facturation/${d.id}`}>{d.number}</RefTag>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/facturation/${d.id}`} className="hover:underline">
                          {d.kind === 'devis' ? 'Devis' : 'Facture'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{formatDate(d.issueDate)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(d.total, d.currency)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {d.kind === 'facture' && d.status !== 'annulee' ? formatMoney(balance, d.currency) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status={d.status}
                          label={
                            d.kind === 'devis'
                              ? QUOTE_STATUS[d.status as keyof typeof QUOTE_STATUS]
                              : INVOICE_STATUS[d.status as keyof typeof INVOICE_STATUS]
                          }
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
