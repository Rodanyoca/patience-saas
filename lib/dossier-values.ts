import {isoDate} from '@/lib/dates'
import {str} from '@/lib/server-utils'
export function dossierValues(fd: FormData) {
  const title = str(fd, 'title')
  if (!title) throw new Error("L'objet du dossier est obligatoire.")
  const departureDate = isoDate(str(fd, 'departureDate'), 'Date de départ')
  const returnDate = isoDate(str(fd, 'returnDate'), 'Date de retour')
  if (departureDate && returnDate && returnDate < departureDate) {
    throw new Error('La date de retour doit être postérieure au départ.')
  }
  return {
    title,
    destination: str(fd, 'destination'),
    agentId: str(fd, 'agentId'),
    priority: str(fd, 'priority') === 'urgente' ? 'urgente' : 'normale',
    departureDate,
    returnDate,
    dueDate: isoDate(str(fd, 'dueDate'), 'Échéance'),
    notes: str(fd, 'notes'),
  }
}
