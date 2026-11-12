import { Field, FormGrid, SelectField, TextArea } from '@/components/forms'
import { TRAVELER_RELATIONS } from '@/lib/constants'

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
  nationality?: string | null
  birthDate?: string | null
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
      </FormGrid>
      <p className="border-t pt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Identité et voyage
      </p>
      <FormGrid>
        <Field label="Nationalité" name="nationality" defaultValue={c?.nationality} />
        <Field label="Date de naissance" name="birthDate" type="date" defaultValue={c?.birthDate} />
        <Field label="N° de passeport" name="passportNumber" defaultValue={c?.passportNumber} />
        <Field label="Expiration du passeport" name="passportExpiry" type="date" defaultValue={c?.passportExpiry} />
      </FormGrid>
      <TextArea label="Notes internes" name="notes" defaultValue={c?.notes} rows={2} />
    </>
  )
}

type TravelerLike = {
  firstName?: string | null
  lastName?: string | null
  relation?: string | null
  birthDate?: string | null
  gender?: string | null
  nationality?: string | null
  passportNumber?: string | null
  passportExpiry?: string | null
}

export function TravelerFields({ t }: { t?: TravelerLike }) {
  const relations = Object.fromEntries(Object.entries(TRAVELER_RELATIONS).filter(([k]) => k !== 'titulaire'))
  return (
    <FormGrid>
      <Field label="Prénom(s)" name="firstName" required defaultValue={t?.firstName} />
      <Field label="Nom" name="lastName" required defaultValue={t?.lastName} />
      {t?.relation === 'titulaire' ? (
        <input type="hidden" name="relation" value="titulaire" />
      ) : (
        <SelectField label="Lien" name="relation" options={relations} defaultValue={t?.relation ?? 'conjoint'} />
      )}
      <SelectField
        label="Sexe"
        name="gender"
        placeholder="—"
        options={{ F: 'Féminin', M: 'Masculin' }}
        defaultValue={t?.gender}
      />
      <Field label="Date de naissance" name="birthDate" type="date" defaultValue={t?.birthDate} />
      <Field label="Nationalité" name="nationality" defaultValue={t?.nationality} />
      <Field label="N° de passeport" name="passportNumber" defaultValue={t?.passportNumber} />
      <Field label="Expiration du passeport" name="passportExpiry" type="date" defaultValue={t?.passportExpiry} />
    </FormGrid>
  )
}
