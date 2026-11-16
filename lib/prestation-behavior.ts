import { SERVICE_FIELDS, SERVICE_STATUS, type ServiceType, type DetailField } from '@/lib/constants'

export const FORM_TYPES = { generic: 'Générique', visa: 'Visa', flight: 'Billetterie', hotel: 'Hôtel', insurance: 'Assurance' } as const
export type FormType = keyof typeof FORM_TYPES
const LEGACY_FORMS: Record<string, FormType> = { visa: 'visa', billet: 'flight', hotel: 'hotel', assurance: 'insurance' }
const FORM_LEGACY: Partial<Record<FormType, ServiceType>> = { visa: 'visa', flight: 'billet', hotel: 'hotel', insurance: 'assurance' }
export const CANCELLED_STATUSES = ['annule', 'annulee'] as const
export function isCancelled(status: string) { return CANCELLED_STATUSES.some((value) => value === status) }
export function legacyForm(type: string): FormType { return LEGACY_FORMS[type] ?? 'generic' }
export function fieldsFor(form: FormType): DetailField[] {
  const type = FORM_LEGACY[form]
  return type ? SERVICE_FIELDS[type] : [{ name: 'observations', label: 'Observations', type: 'textarea' as const }]
}
export function statusesFor(form: FormType): Record<string, string> {
  const type = FORM_LEGACY[form]
  return type ? { ...SERVICE_STATUS[type], annule: 'Annulé' } : { en_attente: 'En attente', en_cours: 'En cours', termine: 'Terminé', annule: 'Annulé' }
}
export function statusLabel(form: FormType, status: string) {
  return isCancelled(status) ? 'Annulé' : statusesFor(form)[status] ?? status
}
export function validateFormType(value: string): FormType {
  if (!Object.hasOwn(FORM_TYPES, value)) throw new Error('Modèle de formulaire invalide.')
  return value as FormType
}
