'use server'

import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { account, agencySettings, currencies, session, user } from '@/lib/db/schema'
import { requireUser } from '@/lib/session'
import { logAudit, str, toErr, type ActionResult } from '@/lib/server-utils'
import { ROLE_LABELS, type Role } from '@/lib/constants'

function role(fd: FormData): Role {
  const r = str(fd, 'role')
  if (r !== 'admin' && r !== 'responsable' && r !== 'agent') throw new Error('Rôle invalide.')
  return r
}

function password(fd: FormData) {
  const p = String(fd.get('password') ?? '')
  if (p.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.')
  if (p.length > 128) throw new Error('Mot de passe trop long.')
  return p
}

export async function createStaff(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireUser(['admin'])
    const name = str(fd, 'name')
    const email = str(fd, 'email')?.toLowerCase()
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Nom et email valides requis.')
    const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
    if (exists) throw new Error('Un compte existe déjà avec cet email.')
    const r = role(fd)
    const hash = await hashPassword(password(fd))
    const id = randomUUID()
    await db.insert(user).values({ id, name, email, role: r, active: true, emailVerified: true })
    await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: hash })
    await logAudit(me, 'Création compte', 'utilisateur', id, `${name} — ${ROLE_LABELS[r]}`)
    revalidatePath('/administration')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateStaff(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireUser(['admin'])
    const name = str(fd, 'name')
    if (!name) throw new Error('Nom obligatoire.')
    const r = role(fd)
    const active = fd.get('active') === 'on'
    if (id === me.id && (r !== 'admin' || !active)) {
      throw new Error('Vous ne pouvez pas retirer vos propres droits d’administrateur.')
    }
    await db.update(user).set({ name, role: r, active, updatedAt: new Date() }).where(eq(user.id, id))
    if (!active) await db.delete(session).where(eq(session.userId, id))
    await logAudit(me, 'Modification compte', 'utilisateur', id, `${name} — ${ROLE_LABELS[r]}${active ? '' : ' (désactivé)'}`)
    revalidatePath('/administration')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function resetStaffPassword(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireUser(['admin'])
    const hash = await hashPassword(password(fd))
    const updated = await db
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, id), eq(account.providerId, 'credential')))
      .returning({ id: account.id })
    if (updated.length === 0) {
      await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: hash })
    }
    await db.delete(session).where(eq(session.userId, id))
    await logAudit(me, 'Réinitialisation mot de passe', 'utilisateur', id)
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function updateSettings(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireUser(['admin'])
    const name = str(fd, 'name')
    if (!name) throw new Error('Le nom de l’agence est obligatoire.')
    const prefix = (k: string, def: string) => (str(fd, k) ?? def).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || def
    const defaultCurrency = str(fd, 'defaultCurrency') ?? 'USD'
    const [cur] = await db.select().from(currencies).where(eq(currencies.code, defaultCurrency))
    if (!cur) throw new Error('Devise inconnue.')
    await db
      .update(agencySettings)
      .set({
        name,
        address: str(fd, 'address'),
        phone: str(fd, 'phone'),
        email: str(fd, 'email'),
        website: str(fd, 'website'),
        taxId: str(fd, 'taxId'),
        documentFooter: str(fd, 'documentFooter'),
        defaultCurrency,
        dossierPrefix: prefix('dossierPrefix', 'DOS'),
        quotePrefix: prefix('quotePrefix', 'DEV'),
        invoicePrefix: prefix('invoicePrefix', 'FAC'),
        receiptPrefix: prefix('receiptPrefix', 'REC'),
        clientPrefix: prefix('clientPrefix', 'CLI'),
        updatedAt: new Date(),
      })
      .where(eq(agencySettings.id, 1))
    await logAudit(me, 'Paramètres modifiés', 'agence', 1)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}

export async function saveCurrency(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireUser(['admin'])
    const code = str(fd, 'code')?.toUpperCase()
    if (!code || !/^[A-Z]{3}$/.test(code)) throw new Error('Code ISO à 3 lettres requis (ex. EUR).')
    const name = str(fd, 'name') ?? code
    const symbol = str(fd, 'symbol') ?? code
    const rate = Number((str(fd, 'rate') ?? '').replace(',', '.'))
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Taux invalide.')
    if (code === 'USD' && rate !== 1) throw new Error('Le USD est la devise de référence (taux = 1).')
    const active = code === 'USD' ? true : fd.get('active') === 'on'
    await db
      .insert(currencies)
      .values({ code, name, symbol, rate: String(rate), active })
      .onConflictDoUpdate({ target: currencies.code, set: { name, symbol, rate: String(rate), active } })
    await logAudit(me, 'Devise enregistrée', 'devise', code, `1 ${code} = ${rate} USD`)
    revalidatePath('/administration')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
