import ExcelJS from 'exceljs'
import { between, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, dossiers, expenses, user as users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import {
  cashJournal,
  marginByDossier,
  marginByType,
  monthlyFlows,
  periodSummary,
  receivables,
  resolvePeriod,
} from '@/lib/reports'
import { DOSSIER_STATUS, EXPENSE_CATEGORIES, PAYMENT_METHODS, SERVICE_TYPES } from '@/lib/constants'
import { logAudit } from '@/lib/server-utils'

export const runtime = 'nodejs'

const NAVY = 'FF1F2B4D'

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number; money?: boolean }[]) {
  const ws = wb.addWorksheet(name)
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.money ? { numFmt: '#,##0.00' } : {} }))
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  return ws
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return new Response('Non autorisé', { status: 401 })
  const url = new URL(req.url)
  const report = url.searchParams.get('report') ?? 'synthese'
  const period = resolvePeriod({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined })
  const financial = ['synthese', 'depenses', 'caisse', 'creances'].includes(report)
  if (financial && user.role === 'agent') return new Response('Accès refusé', { status: 403 })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Gestion agence'
  wb.created = new Date()

  if (report === 'synthese') {
    const [s, flows, byType, byDossier] = await Promise.all([
      periodSummary(period),
      monthlyFlows(period),
      marginByType(period),
      marginByDossier(period),
    ])
    const ws = sheet(wb, 'Synthèse', [
      { header: 'Indicateur', key: 'k', width: 34 },
      { header: 'Montant (USD)', key: 'v', money: true },
    ])
    ws.addRows([
      { k: 'Période', v: `${period.from} → ${period.to}` },
      { k: 'Ventes facturées', v: s.invoiced },
      { k: 'Encaissements clients', v: s.collected },
      { k: 'Prix de vente des prestations', v: s.sales },
      { k: 'Coût d’achat des prestations', v: s.cost },
      { k: 'Marge sur prestations', v: s.margin },
      { k: 'Paiements fournisseurs', v: s.supplierPaid },
      { k: 'Dépenses de fonctionnement', v: s.expenses },
      { k: 'Résultat de trésorerie', v: s.net },
    ])
    const m = sheet(wb, 'Par mois', [
      { header: 'Mois', key: 'month', width: 12 },
      { header: 'Encaissements', key: 'recettes', money: true },
      { header: 'Fournisseurs', key: 'fournisseurs', money: true },
      { header: 'Dépenses', key: 'depenses', money: true },
      { header: 'Solde', key: 'solde', money: true },
    ])
    flows.forEach((f) =>
      m.addRow({
        month: f.month,
        recettes: Number(f.recettes),
        fournisseurs: Number(f.fournisseurs),
        depenses: Number(f.depenses),
        solde: Number(f.recettes) - Number(f.fournisseurs) - Number(f.depenses),
      }),
    )
    const t = sheet(wb, 'Marge par prestation', [
      { header: 'Prestation', key: 'type', width: 26 },
      { header: 'Nombre', key: 'count', width: 10 },
      { header: 'Ventes', key: 'sales', money: true },
      { header: 'Coûts', key: 'cost', money: true },
      { header: 'Marge', key: 'margin', money: true },
    ])
    byType.forEach((r) =>
      t.addRow({
        type: SERVICE_TYPES[r.type as keyof typeof SERVICE_TYPES],
        count: r.count,
        sales: Number(r.sales),
        cost: Number(r.cost),
        margin: Number(r.sales) - Number(r.cost),
      }),
    )
    const d = sheet(wb, 'Marge par dossier', [
      { header: 'Dossier', key: 'reference', width: 18 },
      { header: 'Objet', key: 'title', width: 30 },
      { header: 'Client', key: 'client', width: 26 },
      { header: 'Ventes', key: 'sales', money: true },
      { header: 'Coûts', key: 'cost', money: true },
      { header: 'Marge', key: 'margin', money: true },
    ])
    byDossier.forEach((r) => d.addRow({ ...r, sales: Number(r.sales), cost: Number(r.cost), margin: Number(r.sales) - Number(r.cost) }))
  } else if (report === 'depenses') {
    const rows = await db.select().from(expenses).where(between(expenses.paidAt, period.from, period.to)).orderBy(desc(expenses.paidAt))
    const ws = sheet(wb, 'Dépenses', [
      { header: 'Date', key: 'paidAt', width: 12 },
      { header: 'Libellé', key: 'label', width: 34 },
      { header: 'Catégorie', key: 'category', width: 20 },
      { header: 'Mode', key: 'method' },
      { header: 'Devise', key: 'currency', width: 8 },
      { header: 'Montant', key: 'amount', money: true },
      { header: 'Montant USD', key: 'base', money: true },
    ])
    rows.forEach((e) =>
      ws.addRow({
        ...e,
        category: EXPENSE_CATEGORIES[e.category as keyof typeof EXPENSE_CATEGORIES],
        method: PAYMENT_METHODS[e.method as keyof typeof PAYMENT_METHODS],
        amount: Number(e.amount),
        base: Number(e.amount) * Number(e.rate),
      }),
    )
  } else if (report === 'caisse') {
    const { opening, lines } = await cashJournal(period)
    const ws = sheet(wb, 'Caisse', [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'kind', width: 22 },
      { header: 'Libellé', key: 'label', width: 40 },
      { header: 'Devise', key: 'currency', width: 8 },
      { header: 'Entrée', key: 'in', money: true },
      { header: 'Sortie', key: 'out', money: true },
      { header: 'Solde USD', key: 'balance', money: true },
    ])
    let running = opening
    ws.addRow({ date: period.from, kind: 'Ouverture', label: 'Solde d’ouverture', balance: opening })
    lines.forEach((l) => {
      running += l.direction === 'entree' ? Number(l.base) : -Number(l.base)
      ws.addRow({
        date: l.date,
        kind: l.kind,
        label: l.label,
        currency: l.currency,
        in: l.direction === 'entree' ? Number(l.amount) : null,
        out: l.direction === 'sortie' ? Number(l.amount) : null,
        balance: running,
      })
    })
  } else if (report === 'creances') {
    const rows = await receivables()
    const ws = sheet(wb, 'Créances', [
      { header: 'Facture', key: 'number', width: 18 },
      { header: 'Client', key: 'client', width: 28 },
      { header: 'Échéance', key: 'due_date', width: 12 },
      { header: 'Devise', key: 'currency', width: 8 },
      { header: 'Total', key: 'total', money: true },
      { header: 'Payé', key: 'paid', money: true },
      { header: 'Reste dû', key: 'due', money: true },
    ])
    rows.forEach((r) => ws.addRow({ ...r, total: Number(r.total), paid: Number(r.paid), due: Number(r.total) - Number(r.paid) }))
  } else if (report === 'dossiers') {
    const rows = await db
      .select({
        reference: dossiers.reference,
        title: dossiers.title,
        destination: dossiers.destination,
        status: dossiers.status,
        priority: dossiers.priority,
        departureDate: dossiers.departureDate,
        createdAt: dossiers.createdAt,
        client: sql<string>`${clients.firstName} || ' ' || upper(${clients.lastName})`,
        phone: clients.phone,
        agent: users.name,
      })
      .from(dossiers)
      .innerJoin(clients, eq(clients.id, dossiers.clientId))
      .leftJoin(users, eq(users.id, dossiers.agentId))
      .where(sql`${dossiers.createdAt}::date between ${period.from} and ${period.to}`)
      .orderBy(desc(dossiers.createdAt))
    const ws = sheet(wb, 'Dossiers', [
      { header: 'Référence', key: 'reference', width: 18 },
      { header: 'Ouvert le', key: 'createdAt', width: 12 },
      { header: 'Client', key: 'client', width: 26 },
      { header: 'Téléphone', key: 'phone', width: 16 },
      { header: 'Objet', key: 'title', width: 30 },
      { header: 'Destination', key: 'destination', width: 18 },
      { header: 'Départ', key: 'departureDate', width: 12 },
      { header: 'Agent', key: 'agent', width: 20 },
      { header: 'Priorité', key: 'priority', width: 10 },
      { header: 'Statut', key: 'status', width: 12 },
    ])
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        createdAt: r.createdAt.toISOString().slice(0, 10),
        status: DOSSIER_STATUS[r.status as keyof typeof DOSSIER_STATUS],
      }),
    )
  } else {
    return new Response('Rapport inconnu', { status: 400 })
  }

  await logAudit(user, 'Export Excel', 'rapport', null, `${report} ${period.from} → ${period.to}`)
  const buffer = await wb.xlsx.writeBuffer()
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="rapport-${report}-${period.from}_${period.to}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
