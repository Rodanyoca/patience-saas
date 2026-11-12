import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, commercialDocs, docLines, dossiers, payments } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { getSettings } from '@/lib/server-utils'
import { renderCommercialDoc } from '@/lib/pdf'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non autorisé', { status: 401 })
  const id = Number((await params).id)
  const [row] = await db
    .select({ d: commercialDocs, c: clients, dos: dossiers })
    .from(commercialDocs)
    .innerJoin(clients, eq(clients.id, commercialDocs.clientId))
    .innerJoin(dossiers, eq(dossiers.id, commercialDocs.dossierId))
    .where(eq(commercialDocs.id, id))
  if (!row) return new Response('Introuvable', { status: 404 })

  const [lines, [{ paid }], agency] = await Promise.all([
    db.select().from(docLines).where(eq(docLines.docId, id)).orderBy(asc(docLines.position)),
    db
      .select({ paid: sql<string>`coalesce(sum(${payments.appliedAmount}),0)` })
      .from(payments)
      .where(eq(payments.invoiceId, id)),
    getSettings(),
  ])
  const { d, c, dos } = row
  const buffer = await renderCommercialDoc({
    agency,
    kind: d.kind as 'devis' | 'facture',
    number: d.number,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    currency: d.currency,
    client: {
      name: c.type === 'entreprise' && c.companyName ? c.companyName : `${c.firstName} ${c.lastName.toUpperCase()}`,
      lines: [
        c.type === 'entreprise' ? `À l’attention de ${c.firstName} ${c.lastName}` : null,
        [c.address, c.city, c.country].filter(Boolean).join(', ') || null,
        c.phone,
        c.email,
      ],
    },
    dossier: { reference: dos.reference, title: dos.title, destination: dos.destination },
    lines,
    subtotal: d.subtotal,
    discount: d.discount,
    total: d.total,
    paid: Number(paid),
    notes: d.notes,
  })
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${d.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
