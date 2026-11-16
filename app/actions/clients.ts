'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { clients, dossiers } from '@/lib/db/schema'
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
    passportNumber: fd.has('passportNumber') ? str(fd, 'passportNumber') : undefined,
    passportExpiry: fd.has('passportExpiry') ? str(fd, 'passportExpiry') : undefined,
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
    await db.delete(clients).where(eq(clients.id, id))
    await logAudit(user, 'Suppression', 'client', id)
    revalidatePath('/clients')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
