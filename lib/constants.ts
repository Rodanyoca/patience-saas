export type Role = 'admin' | 'responsable' | 'agent'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  responsable: 'Responsable',
  agent: 'Agent',
}

export const DOSSIER_STATUS = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  termine: 'Clôturé',
  annule: 'Annulé',
} as const
export type DossierStatus = keyof typeof DOSSIER_STATUS

export const PRIORITY = { normale: 'Normale', urgente: 'Urgente' } as const

/** Historical tokens/labels only. Selectable offerings come from prestation_types. */
export const SERVICE_TYPES = {
  visa: 'Assistance visa',
  billet: 'Billetterie aérienne',
  hotel: "Réservation d'hôtel",
  assurance: 'Assurance voyage',
} as const
export type ServiceType = keyof typeof SERVICE_TYPES

export const SERVICE_STATUS: Record<ServiceType, Record<string, string>> = {
  visa: {
    a_preparer: 'Dossier à préparer',
    rdv_pris: 'Rendez-vous pris',
    depose: 'Déposé',
    en_traitement: 'En traitement',
    accorde: 'Accordé',
    refuse: 'Refusé',
  },
  billet: {
    reserve: 'Réservé',
    emis: 'Émis',
    modifie: 'Modifié',
    annule: 'Annulé',
  },
  hotel: {
    demande: 'Demandé',
    confirme: 'Confirmé',
    modifie: 'Modifié',
    annule: 'Annulé',
  },
  assurance: {
    devis: 'Proposition',
    souscrit: 'Souscrit',
    annule: 'Annulé',
  },
}

export type DetailField = {
  name: string
  label: string
  type?: 'text' | 'date' | 'datetime-local' | 'textarea' | 'number'
  options?: Record<string, string>
}

export const SERVICE_FIELDS: Record<ServiceType, DetailField[]> = {
  visa: [
    { name: 'country', label: 'Pays de destination' },
    {
      name: 'visaType',
      label: 'Type de visa',
      options: {
        tourisme: 'Tourisme',
        affaires: 'Affaires',
        etudes: 'Études',
        travail: 'Travail',
        transit: 'Transit',
        famille: 'Visite familiale',
      },
    },
    { name: 'appointmentDate', label: 'Rendez-vous consulaire', type: 'datetime-local' },
    { name: 'depositDate', label: 'Date de dépôt', type: 'date' },
    { name: 'decisionDate', label: 'Date de décision', type: 'date' },
    { name: 'requiredDocs', label: 'Documents requis', type: 'textarea' },
    { name: 'missingDocs', label: 'Pièces manquantes', type: 'textarea' },
    { name: 'result', label: 'Résultat / observations', type: 'textarea' },
  ],
  billet: [
    { name: 'airline', label: 'Compagnie aérienne' },
    { name: 'itinerary', label: 'Itinéraire (ex. ABJ – CDG – ABJ)' },
    {
      name: 'tripType',
      label: 'Type de trajet',
      options: { aller_simple: 'Aller simple', aller_retour: 'Aller-retour', multi: 'Multi-destinations' },
    },
    { name: 'departureDate', label: 'Date de départ', type: 'date' },
    { name: 'returnDate', label: 'Date de retour', type: 'date' },
    { name: 'pnr', label: 'Référence de réservation (PNR)' },
    { name: 'ticketNumbers', label: 'Numéros de billets', type: 'textarea' },
  ],
  hotel: [
    { name: 'hotelName', label: 'Établissement' },
    { name: 'city', label: 'Destination / ville' },
    { name: 'checkIn', label: 'Arrivée', type: 'date' },
    { name: 'checkOut', label: 'Départ', type: 'date' },
    { name: 'rooms', label: 'Chambres (nombre et type)' },
    { name: 'confirmationRef', label: 'Référence de confirmation' },
  ],
  assurance: [
    { name: 'insurer', label: "Compagnie d'assurance" },
    { name: 'plan', label: 'Formule' },
    { name: 'guarantees', label: 'Garanties', type: 'textarea' },
    { name: 'coverageStart', label: 'Début de couverture', type: 'date' },
    { name: 'coverageEnd', label: 'Fin de couverture', type: 'date' },
    { name: 'policyNumber', label: 'Numéro de police' },
  ],
}

export const QUOTE_STATUS = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
} as const

export const INVOICE_STATUS = {
  emise: 'Émise',
  partielle: 'Partiellement payée',
  payee: 'Payée',
  annulee: 'Annulée',
} as const

export const PAYMENT_METHODS = {
  especes: 'Espèces',
  virement: 'Virement bancaire',
  mobile_money: 'Mobile Money',
  carte: 'Carte bancaire',
  cheque: 'Chèque',
} as const

export const SUPPLIER_CATEGORIES = {
  compagnie_aerienne: 'Compagnie aérienne',
  consolidateur: 'Consolidateur / GDS',
  hotel: 'Hôtel',
  assurance: 'Assurance',
  consulat: 'Consulat / centre visa',
  autre: 'Autre',
} as const

export const EXPENSE_CATEGORIES = {
  loyer: 'Loyer',
  salaires: 'Salaires',
  electricite: 'Électricité / eau',
  telecom: 'Téléphone / internet',
  transport: 'Transport',
  fournitures: 'Fournitures',
  marketing: 'Marketing',
  taxes: 'Taxes et impôts',
  banque: 'Frais bancaires',
  autre: 'Autre',
} as const
