'use server'

import { del, put } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { dossiers, files } from '@/lib/db/schema'
import { requireUser } from '@/lib/session'
import { logAudit, str, toErr, type ActionResult } from '@/lib/server-utils'
import { FILE_CATEGORIES } from '@/lib/constants'

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp|heic)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel))$/

export async function uploadFile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const file = fd.get('file')
    if (!(file instanceof File) || file.size === 0) throw new Error('Sélectionnez un fichier.')
    if (file.size > MAX_SIZE) throw new Error('Fichier trop volumineux (10 Mo maximum).')
    if (!ALLOWED.test(file.type)) throw new Error('Format non accepté (PDF, image, Word ou Excel).')
    const category = str(fd, 'category') ?? 'autre'
    if (!(category in FILE_CATEGORIES)) throw new Error('Catégorie invalide.')

    let clientId = Number(str(fd, 'clientId')) || null
    const dossierId = Number(str(fd, 'dossierId')) || null
    if (dossierId) {
      const [d] = await db.select({ clientId: dossiers.clientId }).from(dossiers).where(eq(dossiers.id, dossierId))
      if (!d) throw new Error('Dossier introuvable.')
      clientId = d.clientId
    }
    if (!clientId && !dossierId) throw new Error('Le document doit être rattaché à un client ou un dossier.')

    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
    const blob = await put(`documents/${clientId ?? 'x'}/${safeName}`, file, {
      access: 'private',
      addRandomSuffix: true,
      contentType: file.type,
    })
    const [row] = await db
      .insert(files)
      .values({
        clientId,
        dossierId,
        category,
        name: str(fd, 'name') ?? file.name,
        pathname: blob.pathname,
        contentType: file.type,
        size: file.size,
        confidential: fd.get('confidential') === 'on',
        uploadedBy: user.id,
        uploadedByName: user.name,
      })
      .returning({ id: files.id })
    await logAudit(user, 'Ajout document', 'document', row.id, `${FILE_CATEGORIES[category as keyof typeof FILE_CATEGORIES]} — ${file.name}`)
    revalidatePath('/documents')
    return { ok: true, id: row.id }
  } catch (e) {
    return toErr(e)
  }
}

export async function deleteFile(id: number): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const [f] = await db.select().from(files).where(eq(files.id, id))
    if (!f) throw new Error('Document introuvable.')
    if (user.role === 'agent' && f.uploadedBy !== user.id) {
      throw new Error('Seul l’auteur ou un responsable peut supprimer ce document.')
    }
    await del(f.pathname)
    await db.delete(files).where(eq(files.id, id))
    await logAudit(user, 'Suppression document', 'document', id, f.name)
    revalidatePath('/documents')
    return { ok: true }
  } catch (e) {
    return toErr(e)
  }
}
