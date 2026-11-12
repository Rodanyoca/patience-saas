import { CheckboxField, Field, FormGrid, SelectField, TextArea } from '@/components/forms'
import { SUPPLIER_CATEGORIES } from '@/lib/constants'

type SupplierLike = {
  name?: string | null
  category?: string | null
  contactName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  active?: boolean
}

export function SupplierFields({ s }: { s?: SupplierLike }) {
  return (
    <>
      <FormGrid>
        <Field label="Nom" name="name" required defaultValue={s?.name} />
        <SelectField label="Catégorie" name="category" options={SUPPLIER_CATEGORIES} defaultValue={s?.category ?? 'compagnie_aerienne'} />
        <Field label="Contact" name="contactName" defaultValue={s?.contactName} />
        <Field label="Téléphone" name="phone" defaultValue={s?.phone} />
        <Field label="Email" name="email" type="email" defaultValue={s?.email} />
        <Field label="Adresse" name="address" defaultValue={s?.address} />
      </FormGrid>
      <TextArea label="Notes (conditions, n° de compte agence…)" name="notes" defaultValue={s?.notes} rows={2} />
      {s && <CheckboxField label="Fournisseur actif" name="active" defaultChecked={s.active} />}
    </>
  )
}
