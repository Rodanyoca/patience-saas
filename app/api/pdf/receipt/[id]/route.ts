import { and, eq, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, commercialDocs, payments, user as users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { getSettings } from '@/lib/server-utils'
import { renderReceipt } from '@/lib/pdf'
import { PAYMENT_METHODS } from '@/lib/constants'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non autorisé', { status: 401 })
  const id = Number((await params).id)
  const [row] = await db
    .select({ p: payments, c: clients, inv: commercialDocs, cashier: users.name })
    .from(payments)
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .innerJoin(commercialDocs, eq(commercialDocs.id, payments.invoiceId))
    .leftJoin(users, eq(users.id, payments.createdBy))
    .where(eq(payments.id, id))
  if (!row) return new Response('Introuvable', { status: 404 })
  const { p, c, inv } = row
  const [{ paidUpTo }] = await db
    .select({ paidUpTo: sql<string>`coalesce(sum(${payments.appliedAmount}),0)` })
    .from(payments)
    .where(and(eq(payments.invoiceId, inv.id), lte(payments.id, p.id)))
  const agency = await getSettings()
  const buffer = await renderReceipt({
    agency,
    receiptNumber: p.receiptNumber,
    paidAt: p.paidAt,
    amount: p.amount,
    currency: p.currency,
    method: PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] ?? p.method,
    reference: p.reference,
    client: { name: `${c.firstName} ${c.lastName.toUpperCase()}`, lines: [c.phone, c.email] },
    invoiceNumber: inv.number,
    invoiceTotal: inv.total,
    invoiceCurrency: inv.currency,
    balance: Number(inv.total) - Number(paidUpTo),
    cashier: row.cashier,
  })
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${p.receiptNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
