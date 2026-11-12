'use client'

import { useState } from 'react'
import { Field, FormDialog, FormGrid, SelectField, TextArea, type ActionResult } from '@/components/forms'
import { SERVICE_FIELDS, SERVICE_STATUS, SERVICE_TYPES, type ServiceType } from '@/lib/constants'

type Option = { value: string; label: string; category?: string }

type ServiceLike = {
  type: string
  status: string
  description: string
  supplierId: number | null
  costPrice: string
  salePrice: string
  currency: string
  details: Record<string, string>
}

const SUPPLIER_HINT: Record<ServiceType, string[]> = {
  visa: ['consulat', 'autre'],
  billet: ['compagnie_aerienne', 'consolidateur'],
  hotel: ['hotel', 'consolidateur'],
  assurance: ['assurance'],
}

export function ServiceFormDialog({
  action,
  suppliers,
  currencies,
  service,
  trigger,
  triggerVariant = 'default',
  triggerSize = 'default',
  defaultCurrency = 'USD',
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>
  suppliers: Option[]
  currencies: Option[]
  service?: ServiceLike
  trigger: React.ReactNode
  triggerVariant?: 'default' | 'outline' | 'ghost'
  triggerSize?: 'default' | 'sm' | 'icon-sm'
  defaultCurrency?: string
}) {
  const [type, setType] = useState<ServiceType>((service?.type as ServiceType) ?? 'billet')
  const preferred = suppliers.filter((s) => s.category && SUPPLIER_HINT[type].includes(s.category))
  const others = suppliers.filter((s) => !preferred.includes(s))
  const supplierList = [...preferred, ...others]

  return (
    <FormDialog
      title={service ? `Modifier — ${SERVICE_TYPES[type]}` : 'Ajouter une prestation'}
      description="Les réservations et émissions sont effectuées via vos canaux habituels ; enregistrez-en ici le suivi."
      trigger={trigger}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      action={action}
      success={service ? 'Prestation mise à jour' : 'Prestation ajoutée'}
      wide
    >
      {service ? (
        <input type="hidden" name="type" value={type} />
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type de prestation">
          {(Object.keys(SERVICE_TYPES) as ServiceType[]).map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                type === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              {SERVICE_TYPES[t]}
            </label>
          ))}
        </div>
      )}
      <FormGrid>
        <Field
          label="Désignation"
          name="description"
          required
          defaultValue={service?.description}
          placeholder={
            { visa: 'Visa Schengen court séjour', billet: 'Billet ABJ – CDG', hotel: 'Hôtel 4 nuits', assurance: 'Assurance voyage 30 jours' }[type]
          }
        />
        <SelectField
          key={`status-${type}`}
          label="Statut"
          name="status"
          options={SERVICE_STATUS[type]}
          defaultValue={service?.status}
        />
        <SelectField
          label="Fournisseur / partenaire"
          name="supplierId"
          options={supplierList}
          placeholder="Aucun"
          defaultValue={service?.supplierId}
        />
        <SelectField label="Devise" name="currency" options={currencies} defaultValue={service?.currency ?? defaultCurrency} />
        <Field label="Coût d'achat" name="costPrice" type="number" defaultValue={service?.costPrice ?? '0'} />
        <Field label="Prix de vente" name="salePrice" type="number" defaultValue={service?.salePrice ?? '0'} />
      </FormGrid>
      <p className="border-t pt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Détails — {SERVICE_TYPES[type]}
      </p>
      <FormGrid key={`fields-${type}`}>
        {SERVICE_FIELDS[type].map((f) =>
          f.type === 'textarea' ? (
            <TextArea key={f.name} label={f.label} name={`d_${f.name}`} defaultValue={service?.details?.[f.name]} rows={2} className="sm:col-span-2" />
          ) : f.options ? (
            <SelectField key={f.name} label={f.label} name={`d_${f.name}`} options={f.options} placeholder="—" defaultValue={service?.details?.[f.name]} />
          ) : (
            <Field key={f.name} label={f.label} name={`d_${f.name}`} type={f.type ?? 'text'} defaultValue={service?.details?.[f.name]} />
          ),
        )}
      </FormGrid>
    </FormDialog>
  )
}
