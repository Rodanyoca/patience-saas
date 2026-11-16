import { and } from 'drizzle-orm'
import { branchScope } from '@/lib/branches'
import { serviceNameSql, serviceFormSql } from '@/lib/catalogue'
import { isCancelled, statusLabel, type FormType } from '@/lib/prestation-behavior'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { Pencil, Trash2, Wallet } from 'lucide-react'
import { db } from '@/lib/db'
import { dossiers, services, supplierPayments, suppliers } from '@/lib/db/schema'
import { MANAGERS, requirePageUser } from '@/lib/session'
import { deleteSupplierPayment, recordSupplierPayment, updateSupplier } from '@/app/actions/finance'
import { ActionButton, Field, FormDialog, FormGrid, SelectField, TextArea } from '@/components/forms'
import { SupplierFields } from '@/components/supplier-fields'
import { DefinitionList, EmptyState, PageHeader, Panel, RefTag, StatusPill } from '@/components/shared'
import { currencyOptions } from '@/lib/queries'
import { PAYMENT_METHODS, SERVICE_STATUS, SERVICE_TYPES, SUPPLIER_CATEGORIES, type ServiceType } from '@/lib/constants'
import { formatDate, formatMoney, todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Fournisseur' }

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const actor=await requirePageUser(MANAGERS)
  const id = Number((await params).id)
  const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id))
  if (!s) notFound()

  const [serviceRows, paymentRows, currencies] = await Promise.all([
    db
      .select({ s: services, dossierRef: dossiers.reference, catalogueName: serviceNameSql, formType: serviceFormSql })
      .from(services)
      .innerJoin(dossiers, eq(dossiers.id, services.dossierId))
      .where(and(eq(services.supplierId,id),branchScope(services.branchId,actor)))
      .orderBy(desc(services.createdAt)),
    db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, id)).orderBy(desc(supplierPayments.paidAt)),
    currencyOptions(),
  ])
  const owed = serviceRows.filter((r) => !isCancelled(r.s.status)).reduce((a, r) => a + Number(r.s.costPrice) * Number(r.s.rate), 0)
  const paid = paymentRows.reduce((a, p) => a + Number(p.amount) * Number(p.rate), 0)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/fournisseurs" className="hover:underline">
            Fournisseurs
          </Link>
        }
        title={s.name}
        description={SUPPLIER_CATEGORIES[s.category as keyof typeof SUPPLIER_CATEGORIES]}
        actions={
          <>
            <FormDialog
              title="Modifier le fournisseur"
              trigger={
                <>
                  <Pencil /> Modifier
                </>
              }
              triggerVariant="outline"
              action={updateSupplier.bind(null, s.id)}
              success="Fournisseur mis à jour"
              wide
            >
              <SupplierFields s={s} />
            </FormDialog>
            <FormDialog
              title="Paiement au fournisseur"
              description={`Reste dû : ${formatMoney(owed - paid)}`}
              trigger={
                <>
                  <Wallet /> Enregistrer un paiement
                </>
              }
              action={recordSupplierPayment.bind(null, s.id)}
              success="Paiement enregistré"
            >
              <FormGrid>
                <Field label="Montant" name="amount" type="number" required />
                <SelectField label="Devise" name="currency" options={currencies} defaultValue="USD" />
                <SelectField label="Mode" name="method" options={PAYMENT_METHODS} defaultValue="virement" />
                <Field label="Date" name="paidAt" type="date" defaultValue={todayISO()} />
              </FormGrid>
              <SelectField
                label="Prestation concernée (facultatif)"
                name="serviceId"
                placeholder="Paiement global"
                options={serviceRows.map((r) => ({
                  value: String(r.s.id),
                  label: `${r.dossierRef} — ${r.s.description} (${formatMoney(r.s.costPrice, r.s.currency)})`,
                }))}
              />
              <Field label="Référence" name="reference" />
              <TextArea label="Note" name="notes" rows={2} />
            </FormDialog>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Total des achats', value: owed },
          { label: 'Total payé', value: paid },
          { label: 'Reste dû', value: owed - paid, alert: owed - paid > 0.01 },
        ].map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className={`font-mono text-xl font-semibold ${k.alert ? 'text-destructive' : ''}`}>{formatMoney(k.value)}</span>
          </div>
        ))}
      </div>

      <Panel title="Coordonnées">
        <DefinitionList
          items={[
            { label: 'Contact', value: s.contactName },
            { label: 'Téléphone', value: s.phone },
            { label: 'Email', value: s.email },
            { label: 'Adresse', value: s.address },
            { label: 'Notes', value: s.notes },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={`Prestations associées (${serviceRows.length})`}>
          {serviceRows.length === 0 ? (
            <EmptyState title="Aucune prestation" />
          ) : (
            <ul className="divide-y">
              {serviceRows.map(({ s: sv, dossierRef }) => (
                <li key={sv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <RefTag href={`/dossiers/${sv.dossierId}?tab=prestations`}>{dossierRef}</RefTag>
                  <span className="min-w-0 flex-1 truncate">
                    {sv.description}
                    <span className="block text-xs text-muted-foreground">{serviceRows.find(r=>r.s.id===sv.id)?.catalogueName ?? sv.type}</span>
                  </span>
                  <StatusPill status={sv.status} label={statusLabel((serviceRows.find(r=>r.s.id===sv.id)?.formType??'generic') as FormType,sv.status)} />
                  <span className="font-mono">{formatMoney(sv.costPrice, sv.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Paiements effectués (${paymentRows.length})`}>
          {paymentRows.length === 0 ? (
            <EmptyState title="Aucun paiement" />
          ) : (
            <ul className="divide-y">
              {paymentRows.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1">
                    {formatDate(p.paidAt)} · {PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS]}
                    {p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}
                  </span>
                  <span className="font-mono">{formatMoney(p.amount, p.currency)}</span>
                  <ActionButton
                    action={deleteSupplierPayment.bind(null, p.id)}
                    confirm="Supprimer ce paiement fournisseur ?"
                    variant="ghost"
                    size="icon-sm"
                    success="Paiement supprimé"
                  >
                    <Trash2 />
                    <span className="sr-only">Supprimer</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
