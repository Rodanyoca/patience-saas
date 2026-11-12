'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { clients, dossierSteps, dossierTravelers, dossiers, services, travelers } from '@/lib/db/schema'
import { requireUser, MANAGERS } from '@/lib/session'
import { getRate, logAudit, nextNumber, num, str, toErr, type ActionResult } from '@/lib/server-utils'
import {
  DOSSIER_STATUS,
  SERVICE_FIELDS,
  SERVICE_STATUS,
  SERVICE_TYPES,
  type DossierStatus,
  type ServiceType,
} from '@/lib/constants'

async function addStep(dossierId: number, label: string, user: { id: string; name: string }, note?: string | null) {
  await db.insert(dossierSteps).values({ dossierId, label, note: note ?? null, userId: user.id, userName: user.name })
  await db.update(dossiers).set({ updatedAt: new Date() }).where(eq(dossiers.id, dossierId))
}

function dossierValues(fd: FormData) {
  const title = str(fd, 'title')
  if (!title) throw new Error("L'objet du dossier est obligatoire.")
  const departureDate = str(fd, 'departureDate')
  const returnDate = str(fd, 'returnDate')
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
    dueDate: str(fd, 'dueDate'),
    notes: str(fd, 'notes'),
  }
}

export async function createDossier(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const clientId = Number(str(fd, 'clientId'))
    if (!clientId) throw new Error('Sélectionnez un client.')
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId))
    if (!client) throw new Error('Client introuvable.')
    const values = dossierValues(fd)
    const reference = await nextNumber('dossier')
    const [row] = await db
      .insert(dossiers)
      .values({ ...values, agentId: values.agentId ?? user.id, clientId, reference, createdBy: user.id })
      .returning({ id: dossiers.id })

    const travelerIds = fd
      .getAll('travelerIds')
      .map((v) => Number(v))
      .filter(Boolean)
    if (travelerIds.length) {
      const valid = await db
        .select({ id: travelers.id })
        .from(travelers)
        .where(and(eq(travelers.clientId, clientId), inArray(travelers.id, travelerIds)))
      if (valid.length) {
        await db.insert(dossierTravelers).values(valid.map((t) => ({ dossierId: row.id, travelerId: t.id })))
      }
    }
    await addStep(row.id, 'Dossier ouvert', user)
    await logAudit(user, 'Création', 'dossier', row.id, reference)
    revalidatePath('/dossiers')
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateDossier(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const values = dossierValues(fd)
    await db.update(dossiers).set({ ...values, updatedAt: new Date() }).where(eq(dossiers.id, id))
    await addStep(id, 'Informations du dossier modifiées', user)
    await logAudit(user, 'Modification', 'dossier', id)
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function setDossierStatus(id: number, status: DossierStatus): Promise<ActionResult> {
  try {
    const user = await requireUser(status === 'annule' ? MANAGERS : undefined)
    if (!(status in DOSSIER_STATUS)) throw new Error('Statut invalide.')
    await db
      .update(dossiers)
      .set({ status, updatedAt: new Date(), closedAt: status === 'termine' || status === 'annule' ? new Date() : null })
      .where(eq(dossiers.id, id))
    await addStep(id, `Statut : ${DOSSIER_STATUS[status]}`, user)
    await logAudit(user, 'Changement de statut', 'dossier', id, DOSSIER_STATUS[status])
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function addDossierNote(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const label = str(fd, 'label')
    if (!label) throw new Error("Indiquez l'étape ou l'observation.")
    await addStep(id, label, user, str(fd, 'note'))
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function setDossierTravelers(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [d] = await db.select().from(dossiers).where(eq(dossiers.id, id))
    if (!d) throw new Error('Dossier introuvable.')
    const ids = fd
      .getAll('travelerIds')
      .map((v) => Number(v))
      .filter(Boolean)
    await db.delete(dossierTravelers).where(eq(dossierTravelers.dossierId, id))
    if (ids.length) {
      const valid = await db
        .select({ id: travelers.id })
        .from(travelers)
        .where(and(eq(travelers.clientId, d.clientId), inArray(travelers.id, ids)))
      if (valid.length) await db.insert(dossierTravelers).values(valid.map((t) => ({ dossierId: id, travelerId: t.id })))
    }
    await addStep(id, `Voyageurs mis à jour (${ids.length})`, user)
    revalidatePath(`/dossiers/${id}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

// --- Prestations -------------------------------------------------------------

async function serviceValues(type: ServiceType, fd: FormData) {
  const status = str(fd, 'status') ?? Object.keys(SERVICE_STATUS[type])[0]
  if (!(status in SERVICE_STATUS[type])) throw new Error('Statut invalide.')
  const costPrice = num(fd, 'costPrice')
  const salePrice = num(fd, 'salePrice')
  if (!Number.isFinite(costPrice) || !Number.isFinite(salePrice) || costPrice < 0 || salePrice < 0) {
    throw new Error('Les montants doivent être des nombres positifs.')
  }
  const details: Record<string, string> = {}
  for (const f of SERVICE_FIELDS[type]) {
    const v = str(fd, `d_${f.name}`)
    if (v) details[f.name] = v
  }
  const currency = str(fd, 'currency') ?? 'USD'
  const description = str(fd, 'description') ?? SERVICE_TYPES[type]
  const supplierId = Number(str(fd, 'supplierId')) || null
  return {
    status,
    description,
    costPrice: costPrice.toFixed(2),
    salePrice: salePrice.toFixed(2),
    currency,
    rate: String(await getRate(currency)),
    supplierId,
    details,
  }
}

export async function addService(dossierId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const type = str(fd, 'type') as ServiceType
    if (!(type in SERVICE_TYPES)) throw new Error('Type de prestation invalide.')
    const values = await serviceValues(type, fd)
    const [row] = await db
      .insert(services)
      .values({ ...values, type, dossierId })
      .returning({ id: services.id })
    const [d] = await db.select({ status: dossiers.status }).from(dossiers).where(eq(dossiers.id, dossierId))
    if (d?.status === 'en_attente') await db.update(dossiers).set({ status: 'en_cours' }).where(eq(dossiers.id, dossierId))
    await addStep(dossierId, `Prestation ajoutée : ${SERVICE_TYPES[type]}`, user, values.description)
    await logAudit(user, 'Ajout prestation', 'dossier', dossierId, SERVICE_TYPES[type])
    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateService(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [s] = await db.select().from(services).where(eq(services.id, id))
    if (!s) throw new Error('Prestation introuvable.')
    const type = s.type as ServiceType
    const values = await serviceValues(type, fd)
    await db.update(services).set({ ...values, updatedAt: new Date() }).where(eq(services.id, id))
    const statusLabel = SERVICE_STATUS[type][values.status]
    await addStep(
      s.dossierId,
      s.status !== values.status ? `${SERVICE_TYPES[type]} : ${statusLabel}` : `${SERVICE_TYPES[type]} mise à jour`,
      user,
      values.description,
    )
    await logAudit(user, 'Modification prestation', 'dossier', s.dossierId, `${SERVICE_TYPES[type]} — ${statusLabel}`)
    revalidatePath(`/dossiers/${s.dossierId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteService(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const [s] = await db.select().from(services).where(eq(services.id, id))
    if (!s) throw new Error('Prestation introuvable.')
    await db.delete(services).where(eq(services.id, id))
    await addStep(s.dossierId, `Prestation supprimée : ${SERVICE_TYPES[s.type as ServiceType]}`, user, s.description)
    await logAudit(user, 'Suppression prestation', 'dossier', s.dossierId)
    revalidatePath(`/dossiers/${s.dossierId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
