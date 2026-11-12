import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requirePageUser, MANAGERS } from '@/lib/session'
import { supplierBalances } from '@/lib/reports'
import { createSupplier } from '@/app/actions/finance'
import { FormDialog } from '@/components/forms'
import { SupplierFields } from '@/components/supplier-fields'
import { EmptyState, PageHeader, Panel, Pill } from '@/components/shared'
import { SUPPLIER_CATEGORIES } from '@/lib/constants'
import { formatMoney } from '@/lib/format'

export const metadata: Metadata = { title: 'Fournisseurs' }

export default async function SuppliersPage() {
  await requirePageUser(MANAGERS)
  const rows = await supplierBalances()
  const totalDue = rows.reduce((a, r) => a + Math.max(0, Number(r.owed) - Number(r.paid)), 0)

  return (
    <>
      <PageHeader
        title="Fournisseurs et partenaires"
        description={`Montant total restant dû aux fournisseurs : ${formatMoney(totalDue)}`}
        actions={
          <FormDialog
            title="Nouveau fournisseur"
            trigger={
              <>
                <Plus /> Nouveau fournisseur
              </>
            }
            action={createSupplier}
            success="Fournisseur créé"
            wide
          >
            <SupplierFields />
          </FormDialog>
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="Aucun fournisseur">
            Enregistrez les compagnies aériennes, hôtels, assureurs et consulats avec lesquels vous travaillez.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fournisseur</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Catégorie</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Achats</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Payé</th>
                  <th className="px-4 py-2.5 text-right font-medium">Reste dû</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((s) => {
                  const due = Number(s.owed) - Number(s.paid)
                  return (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/fournisseurs/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        {!s.active && (
                          <span className="ml-2">
                            <Pill tone="muted">Inactif</Pill>
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        {SUPPLIER_CATEGORIES[s.category as keyof typeof SUPPLIER_CATEGORIES]}
                      </td>
                      <td className="hidden px-4 py-3 text-right font-mono md:table-cell">{formatMoney(s.owed)}</td>
                      <td className="hidden px-4 py-3 text-right font-mono md:table-cell">{formatMoney(s.paid)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${due > 0.01 ? 'text-destructive' : ''}`}>
                        {formatMoney(due)}
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
