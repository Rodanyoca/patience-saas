'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { clients, dossiers, travelers } from '@/lib/db/schema'
import { MANAGERS, requireUser } from '@/lib/session'
import { logAudit, nextNumber, str, toErr, type ActionResult } from '@/lib/server-utils'

function clientValues(fd: FormData) {
  const firstName = str(fd, 'firstName')
  const lastName = str(fd, 'lastName')
  if (!firstName || !lastName) throw new Error('Le nom et le prénom sont obligatoires.')
  const email = str(fd, 'email')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse email invalide.')
  return {
    type: str(fd, 'type') === 'entreprise' ? 'entreprise' : 'particulier',
    firstName,
    lastName,
    companyName: str(fd, 'companyName'),
    phone: str(fd, 'phone'),
    email,
    address: str(fd, 'address'),
    city: str(fd, 'city'),
    country: str(fd, 'country'),
    nationality: str(fd, 'nationality'),
    birthDate: str(fd, 'birthDate'),
    passportNumber: str(fd, 'passportNumber'),
    passportExpiry: str(fd, 'passportExpiry'),
    notes: str(fd, 'notes'),
  }
}

export async function createClient(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const values = clientValues(fd)
    if (values.phone) {
      const [dup] = await db
        .select({ id: clients.id, reference: clients.reference })
        .from(clients)
        .where(eq(clients.phone, values.phone))
      if (dup) throw new Error(`Un client avec ce téléphone existe déjà (${dup.reference}).`)
    }
    const reference = await nextNumber('client')
    const [row] = await db
      .insert(clients)
      .values({ ...values, reference, createdBy: user.id })
      .returning({ id: clients.id })
    await db.insert(travelers).values({
      clientId: row.id,
      firstName: values.firstName,
      lastName: values.lastName,
      relation: 'titulaire',
      birthDate: values.birthDate,
      nationality: values.nationality,
      passportNumber: values.passportNumber,
      passportExpiry: values.passportExpiry,
    })
    await logAudit(user, 'Création', 'client', row.id, `${reference} — ${values.firstName} ${values.lastName}`)
    revalidatePath('/clients')
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateClient(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const values = clientValues(fd)
    await db.update(clients).set({ ...values, updatedAt: new Date() }).where(eq(clients.id, id))
    await db
      .update(travelers)
      .set({
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: values.birthDate,
        nationality: values.nationality,
        passportNumber: values.passportNumber,
        passportExpiry: values.passportExpiry,
      })
      .where(and(eq(travelers.clientId, id), eq(travelers.relation, 'titulaire')))
    await logAudit(user, 'Modification', 'client', id)
    revalidatePath(`/clients/${id}`)
    return { ok: true, id }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteClient(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser(MANAGERS)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dossiers)
      .where(eq(dossiers.clientId, id))
    if (count > 0) throw new Error('Ce client possède des dossiers et ne peut pas être supprimé.')
    await db.delete(travelers).where(eq(travelers.clientId, id))
    await db.delete(clients).where(eq(clients.id, id))
    await logAudit(user, 'Suppression', 'client', id)
    revalidatePath('/clients')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

function travelerValues(fd: FormData) {
  const firstName = str(fd, 'firstName')
  const lastName = str(fd, 'lastName')
  if (!firstName || !lastName) throw new Error('Le nom et le prénom du voyageur sont obligatoires.')
  return {
    firstName,
    lastName,
    relation: str(fd, 'relation') ?? 'autre',
    birthDate: str(fd, 'birthDate'),
    gender: str(fd, 'gender'),
    nationality: str(fd, 'nationality'),
    passportNumber: str(fd, 'passportNumber'),
    passportExpiry: str(fd, 'passportExpiry'),
  }
}

export async function addTraveler(clientId: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [row] = await db
      .insert(travelers)
      .values({ ...travelerValues(fd), clientId })
      .returning({ id: travelers.id })
    await logAudit(user, 'Ajout voyageur', 'client', clientId)
    revalidatePath(`/clients/${clientId}`)
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateTraveler(id: number, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [row] = await db
      .update(travelers)
      .set(travelerValues(fd))
      .where(eq(travelers.id, id))
      .returning({ clientId: travelers.clientId })
    await logAudit(user, 'Modification voyageur', 'client', row?.clientId)
    revalidatePath(`/clients/${row?.clientId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteTraveler(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [t] = await db.select().from(travelers).where(eq(travelers.id, id))
    if (!t) throw new Error('Voyageur introuvable.')
    if (t.relation === 'titulaire') throw new Error('Le titulaire ne peut pas être retiré.')
    await db.delete(travelers).where(eq(travelers.id, id))
    await logAudit(user, 'Suppression voyageur', 'client', t.clientId)
    revalidatePath(`/clients/${t.clientId}`)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
