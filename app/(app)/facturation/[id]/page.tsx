import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { FileDown, Plus, Trash2, Wallet } from 'lucide-react'
import { db } from '@/lib/db'
import { clients, commercialDocs, docLines, dossiers, payments } from '@/lib/db/schema'
import { requirePageUser } from '@/lib/session'
import {
  addLine,
  cancelInvoice,
  convertQuote,
  deleteLine,
  deletePayment,
  recordPayment,
  setQuoteStatus,
  updateDocMeta,
} from '@/app/actions/billing'
import { ActionButton, Field, FormDialog, FormGrid, SelectField, TextArea } from '@/components/forms'
import { EmptyState, PageHeader, Panel, RefTag, StatusPill } from '@/components/shared'
import { buttonVariants } from '@/components/ui/button'
import { currencyOptions } from '@/lib/queries'
import { INVOICE_STATUS, PAYMENT_METHODS, QUOTE_STATUS } from '@/lib/constants'
import { formatDate, formatMoney, todayISO } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const [d] = await db.select({ number: commercialDocs.number }).from(commercialDocs).where(eq(commercialDocs.id, Number(id)))
  return { title: d?.number ?? 'Document' }
}

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const id = Number((await params).id)
  if (!id) notFound()
  const [row] = await db
    .select({ d: commercialDocs, c: clients, dossierRef: dossiers.reference, dossierTitle: dossiers.title })
    .from(commercialDocs)
    .innerJoin(clients, eq(clients.id, commercialDocs.clientId))
    .innerJoin(dossiers, eq(dossiers.id, commercialDocs.dossierId))
    .where(eq(commercialDocs.id, id))
  if (!row) notFound()
  const { d, c } = row
  const isQuote = d.kind === 'devis'

  const [lines, paymentRows, currencies, [invoiceFromQuote]] = await Promise.all([
    db.select().from(docLines).where(eq(docLines.docId, id)).orderBy(asc(docLines.position)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.paidAt)),
    currencyOptions(),
    isQuote
      ? db
          .select({ id: commercialDocs.id, number: commercialDocs.number })
          .from(commercialDocs)
          .where(and(eq(commercialDocs.sourceQuoteId, id), ne(commercialDocs.status, 'annulee')))
      : Promise.resolve([] as { id: number; number: string }[]),
  ])

  const paid = paymentRows.reduce((a, p) => a + Number(p.appliedAmount), 0)
  const balance = Number(d.total) - paid
  const editable = isQuote ? d.status !== 'accepte' : d.status !== 'annulee' && paymentRows.length === 0
  const statusLabel = isQuote
    ? QUOTE_STATUS[d.status as keyof typeof QUOTE_STATUS]
    : INVOICE_STATUS[d.status as keyof typeof INVOICE_STATUS]
  const isManager = user.role !== 'agent'

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={isQuote ? '/facturation?tab=devis' : '/facturation'} className="hover:underline">
              Facturation
            </Link>{' '}
            · Dossier{' '}
            <Link href={`/dossiers/${d.dossierId}?tab=facturation`} className="font-mono hover:underline">
              {row.dossierRef}
            </Link>
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {isQuote ? 'Devis' : 'Facture'} <RefTag>{d.number}</RefTag>
            <StatusPill status={d.status} label={statusLabel} />
          </span>
        }
        description={`${c.firstName} ${c.lastName.toUpperCase()} — ${row.dossierTitle}`}
        actions={
          <>
            <a href={`/api/pdf/doc/${d.id}`} className={buttonVariants({ variant: 'outline' })}>
              <FileDown /> PDF
            </a>
            {isQuote && d.status === 'brouillon' && (
              <ActionButton action={setQuoteStatus.bind(null, d.id, 'envoye')} size="default" success="Devis marqué envoyé">
                Marquer envoyé
              </ActionButton>
            )}
            {isQuote && d.status !== 'accepte' && d.status !== 'refuse' && (
              <>
                <ActionButton action={setQuoteStatus.bind(null, d.id, 'refuse')} size="default" success="Devis refusé">
                  Refusé
                </ActionButton>
                <ActionButton
                  action={convertQuote.bind(null, d.id)}
                  confirm="Le client a validé ce devis ? Une facture sera générée avec les mêmes lignes."
                  variant="default"
                  size="default"
                  success="Facture créée"
                >
                  Accepté → Facturer
                </ActionButton>
              </>
            )}
            {invoiceFromQuote && (
              <Link href={`/facturation/${invoiceFromQuote.id}`} className={buttonVariants()}>
                Voir la facture {invoiceFromQuote.number}
              </Link>
            )}
            {!isQuote && d.status !== 'annulee' && d.status !== 'payee' && (
              <FormDialog
                title="Enregistrer un paiement"
                description={`Solde restant : ${formatMoney(balance, d.currency)}`}
                trigger={
                  <>
                    <Wallet /> Encaisser
                  </>
                }
                action={recordPayment.bind(null, d.id)}
                success="Paiement enregistré"
              >
                <FormGrid>
                  <Field label="Montant" name="amount" type="number" required defaultValue={balance.toFixed(2)} />
                  <SelectField label="Devise" name="currency" options={currencies} defaultValue={d.currency} />
                  <SelectField label="Mode de paiement" name="method" options={PAYMENT_METHODS} defaultValue="especes" />
                  <Field label="Date" name="paidAt" type="date" defaultValue={todayISO()} required />
                  <Field label="Référence (n° transaction, chèque…)" name="reference" className="sm:col-span-2" />
                </FormGrid>
                <TextArea label="Note" name="notes" rows={2} />
                <p className="text-xs text-muted-foreground">
                  Les paiements dans une autre devise sont convertis au taux paramétré. Un reçu numéroté est généré.
                </p>
              </FormDialog>
            )}
            {!isQuote && isManager && d.status !== 'annulee' && paymentRows.length === 0 && (
              <ActionButton
                action={cancelInvoice.bind(null, d.id)}
                confirm="Annuler cette facture ? Les prestations pourront être refacturées."
                variant="destructive"
                size="default"
                success="Facture annulée"
              >
                Annuler
              </ActionButton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Lignes"
          className="lg:col-span-2"
          actions={
            editable && (
              <FormDialog
                title="Ajouter une ligne"
                trigger={
                  <>
                    <Plus /> Ligne
                  </>
                }
                triggerVariant="outline"
                triggerSize="sm"
                action={addLine.bind(null, d.id)}
                success="Ligne ajoutée"
              >
                <Field label="Libellé" name="description" required placeholder="Ex. Frais de service" />
                <FormGrid>
                  <Field label="Quantité" name="quantity" type="number" defaultValue="1" />
                  <Field label={`Prix unitaire (${d.currency})`} name="unitPrice" type="number" required />
                </FormGrid>
              </FormDialog>
            )
          }
        >
          {lines.length === 0 ? (
            <EmptyState title="Aucune ligne" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Désignation</th>
                    <th className="px-4 py-2 text-right font-medium">Qté</th>
                    <th className="px-4 py-2 text-right font-medium">P.U.</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    {editable && <th className="w-10 px-2 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">{l.description}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{Number(l.quantity)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatMoney(l.unitPrice, d.currency)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatMoney(l.total, d.currency)}</td>
                      {editable && (
                        <td className="px-2 py-2.5">
                          <ActionButton action={deleteLine.bind(null, l.id)} variant="ghost" size="icon-sm" success="Ligne supprimée">
                            <Trash2 />
                            <span className="sr-only">Supprimer la ligne</span>
                          </ActionButton>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 border-t p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="font-mono">{formatMoney(d.subtotal, d.currency)}</dd>
            </div>
            {Number(d.discount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Remise</dt>
                <dd className="font-mono">− {formatMoney(d.discount, d.currency)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="font-mono">{formatMoney(d.total, d.currency)}</dd>
            </div>
            {!isQuote && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Payé</dt>
                  <dd className="font-mono">{formatMoney(paid, d.currency)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Reste à payer</dt>
                  <dd className={`font-mono ${balance > 0.01 && d.status !== 'annulee' ? 'text-destructive' : ''}`}>
                    {formatMoney(balance, d.currency)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel
            title="Détails"
            actions={
              editable && (
                <FormDialog
                  title="Modifier le document"
                  trigger="Modifier"
                  triggerVariant="outline"
                  triggerSize="sm"
                  action={updateDocMeta.bind(null, d.id)}
                  success="Document mis à jour"
                >
                  <FormGrid>
                    <Field label="Date d’émission" name="issueDate" type="date" defaultValue={d.issueDate} />
                    <Field label={isQuote ? 'Valable jusqu’au' : 'Échéance'} name="dueDate" type="date" defaultValue={d.dueDate} />
                    <Field label={`Remise (${d.currency})`} name="discount" type="number" defaultValue={d.discount} />
                  </FormGrid>
                  <TextArea label="Conditions / notes" name="notes" defaultValue={d.notes} />
                </FormDialog>
              )
            }
          >
            <dl className="flex flex-col gap-3 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Émis le</dt>
                <dd>{formatDate(d.issueDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{isQuote ? 'Validité' : 'Échéance'}</dt>
                <dd>{formatDate(d.dueDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Devise</dt>
                <dd className="font-mono">{d.currency}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Client</dt>
                <dd className="text-right">
                  <Link href={`/clients/${c.id}`} className="hover:underline">
                    {c.firstName} {c.lastName.toUpperCase()}
                  </Link>
                </dd>
              </div>
              {d.notes && <p className="border-t pt-3 leading-relaxed text-muted-foreground">{d.notes}</p>}
            </dl>
          </Panel>

          {!isQuote && (
            <Panel title={`Paiements (${paymentRows.length})`}>
              {paymentRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Aucun paiement enregistré.</p>
              ) : (
                <ul className="divide-y">
                  {paymentRows.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium">{formatMoney(p.amount, p.currency)}</span>
                        <div className="flex items-center gap-1">
                          <a
                            href={`/api/pdf/receipt/${p.id}`}
                            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                            aria-label={`Reçu ${p.receiptNumber}`}
                          >
                            <FileDown />
                          </a>
                          {isManager && (
                            <ActionButton
                              action={deletePayment.bind(null, p.id)}
                              confirm="Supprimer ce paiement ? Le solde de la facture sera recalculé."
                              variant="ghost"
                              size="icon-sm"
                              success="Paiement supprimé"
                            >
                              <Trash2 />
                              <span className="sr-only">Supprimer</span>
                            </ActionButton>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.receiptNumber} · {formatDate(p.paidAt)} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
