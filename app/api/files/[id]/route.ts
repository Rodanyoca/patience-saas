import { get } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { dossiers, files } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { canAccessFile } from '@/lib/file-access'
import { logAudit } from '@/lib/server-utils'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non autorisé', { status: 401 })
  const id = Number((await params).id)
  const [row] = await db
    .select({ f: files, agentId: dossiers.agentId })
    .from(files)
    .leftJoin(dossiers, eq(dossiers.id, files.dossierId))
    .where(eq(files.id, id))
  if (!row) return new Response('Introuvable', { status: 404 })
  if (!canAccessFile(user, row.f, row.agentId)) return new Response('Accès refusé', { status: 403 })

  const result = await get(row.f.pathname, { access: 'private' })
  if (!result || result.statusCode !== 200) return new Response('Introuvable', { status: 404 })

  const download = new URL(req.url).searchParams.get('download') === '1'
  if (row.f.confidential) await logAudit(user, 'Consultation document confidentiel', 'document', id, row.f.name)
  const ext = row.f.pathname.split('.').pop()
  const filename = row.f.name.includes('.') ? row.f.name : `${row.f.name}.${ext}`
  return new Response(result.stream, {
    headers: {
      'Content-Type': row.f.contentType ?? result.blob.contentType,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
