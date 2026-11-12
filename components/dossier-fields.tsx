import { Field, FormGrid, SelectField, TextArea } from '@/components/forms'
import { PRIORITY } from '@/lib/constants'

type DossierLike = {
  title?: string | null
  destination?: string | null
  agentId?: string | null
  priority?: string | null
  departureDate?: string | null
  returnDate?: string | null
  dueDate?: string | null
  notes?: string | null
}

export function DossierFields({
  d,
  staff,
  defaultAgent,
}: {
  d?: DossierLike
  staff: { value: string; label: string }[]
  defaultAgent?: string
}) {
  return (
    <>
      <FormGrid>
        <Field label="Objet de la demande" name="title" required defaultValue={d?.title} placeholder="Ex. Voyage d'affaires Paris" />
        <Field label="Destination" name="destination" defaultValue={d?.destination} placeholder="Ex. Paris, France" />
        <SelectField
          label="Agent responsable"
          name="agentId"
          options={staff}
          defaultValue={d?.agentId ?? defaultAgent}
          placeholder="Non attribué"
        />
        <SelectField label="Priorité" name="priority" options={PRIORITY} defaultValue={d?.priority ?? 'normale'} />
      </FormGrid>
      <FormGrid cols={3}>
        <Field label="Date de départ" name="departureDate" type="date" defaultValue={d?.departureDate} />
        <Field label="Date de retour" name="returnDate" type="date" defaultValue={d?.returnDate} />
        <Field label="Échéance de traitement" name="dueDate" type="date" defaultValue={d?.dueDate} />
      </FormGrid>
      <TextArea label="Observations" name="notes" defaultValue={d?.notes} />
    </>
  )
}
