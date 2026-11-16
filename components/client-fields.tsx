import { Field, FormGrid, SelectField, TextArea } from '@/components/forms'

type ClientLike = {
  type?: string | null
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  passportNumber?: string | null
  passportExpiry?: string | null
  notes?: string | null
}

export function ClientFields({ c }: { c?: ClientLike }) {
  return (
    <>
      <FormGrid>
        <SelectField
          label="Type de client"
          name="type"
          defaultValue={c?.type ?? 'particulier'}
          options={{ particulier: 'Particulier', entreprise: 'Entreprise' }}
        />
        <Field label="Raison sociale (entreprise)" name="companyName" defaultValue={c?.companyName} />
        <Field label="Prénom(s)" name="firstName" required defaultValue={c?.firstName} />
        <Field label="Nom" name="lastName" required defaultValue={c?.lastName} />
        <Field label="Téléphone" name="phone" type="tel" defaultValue={c?.phone} />
        <Field label="Email" name="email" type="email" defaultValue={c?.email} />
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Adresse" name="address" defaultValue={c?.address} />
        <Field label="Ville" name="city" defaultValue={c?.city} />
        <Field label="Pays" name="country" defaultValue={c?.country} />
        <TextArea label="Notes internes" name="notes" defaultValue={c?.notes} rows={2} className="sm:col-span-3" />
      </FormGrid>
    </>
  )
}
