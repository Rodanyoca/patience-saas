import { BRAND } from '@/lib/brand'
import 'server-only'
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { formatDate, formatMoney } from '@/lib/format'

// Built-in Helvetica only covers WinAnsi; replace narrow/no-break spaces from Intl.
const clean = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')
const money = (v: number | string, c: string) => clean(formatMoney(v, c))
const date = (v: string | Date | null | undefined) => clean(formatDate(v))

const NAVY = BRAND.blue
const GOLD = BRAND.gold
const MUTED = BRAND.muted
const BORDER = BRAND.border

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: BRAND.text },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  agency: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY },
  small: { fontSize: 9, color: MUTED, lineHeight: 1.4 },
  docTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'right' },
  ref: {
    marginTop: 4,
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: NAVY,
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontFamily: 'Courier-Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
  band: { height: 3, backgroundColor: GOLD, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  box: { width: '48%', borderWidth: 1, borderColor: BORDER, padding: 10, borderRadius: 3 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  th: { flexDirection: 'row', backgroundColor: NAVY, color: '#ffffff', paddingVertical: 6, paddingHorizontal: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 6, paddingHorizontal: 8 },
  c1: { flex: 1 },
  c2: { width: 40, textAlign: 'right' },
  c3: { width: 90, textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 2,
    borderColor: NAVY,
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
  },
  notes: { marginTop: 24, padding: 10, backgroundColor: BRAND.surface, fontSize: 9, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: MUTED },
})

type Agency = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  taxId: string | null
  documentFooter: string | null
}

type Party = { name: string; lines: (string | null | undefined)[] }

function Header({ agency, title, number }: { agency: Agency; title: string; number: string }) {
  return (
    <>
      <View style={s.header}>
        <View>
          <Text style={s.agency}>{agency.name}</Text>
          {[agency.address, agency.phone, agency.email, agency.website, agency.taxId && `N° fiscal : ${agency.taxId}`]
            .filter(Boolean)
            .map((l) => (
              <Text key={l as string} style={s.small}>
                {l}
              </Text>
            ))}
        </View>
        <View>
          <Text style={s.docTitle}>{title}</Text>
          <Text style={s.ref}>{number}</Text>
        </View>
      </View>
      <View style={s.band} />
    </>
  )
}

function Footer({ agency }: { agency: Agency }) {
  return (
    <Text style={s.footer} fixed>
      {agency.documentFooter ?? `${agency.name} — Merci de votre confiance.`}
    </Text>
  )
}

export async function renderCommercialDoc(data: {
  agency: Agency
  kind: 'devis' | 'facture'
  number: string
  issueDate: string
  dueDate: string | null
  currency: string
  client: Party
  dossier: { reference: string; title: string; destination: string | null }
  lines: { description: string; quantity: string; unitPrice: string; total: string }[]
  subtotal: string
  discount: string
  total: string
  paid?: number
  notes: string | null
}) {
  const isQuote = data.kind === 'devis'
  const balance = Number(data.total) - (data.paid ?? 0)
  return renderToBuffer(
    <Document title={`${isQuote ? 'Devis' : 'Facture'} ${data.number}`} author={data.agency.name}>
      <Page size="A4" style={s.page}>
        <Header agency={data.agency} title={isQuote ? 'DEVIS' : 'FACTURE'} number={data.number} />
        <View style={s.row}>
          <View style={s.box}>
            <Text style={s.label}>Client</Text>
            <Text style={s.bold}>{data.client.name}</Text>
            {data.client.lines.filter(Boolean).map((l) => (
              <Text key={l as string} style={s.small}>
                {l}
              </Text>
            ))}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Références</Text>
            <Text style={s.small}>Date : {date(data.issueDate)}</Text>
            <Text style={s.small}>
              {isQuote ? 'Valable jusqu’au' : 'Échéance'} : {date(data.dueDate)}
            </Text>
            <Text style={s.small}>Dossier : {data.dossier.reference}</Text>
            <Text style={s.small}>
              Objet : {data.dossier.title}
              {data.dossier.destination ? ` — ${data.dossier.destination}` : ''}
            </Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.c1}>Désignation</Text>
          <Text style={s.c2}>Qté</Text>
          <Text style={s.c3}>P.U.</Text>
          <Text style={s.c3}>Total</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.c1}>{l.description}</Text>
            <Text style={s.c2}>{Number(l.quantity)}</Text>
            <Text style={s.c3}>{money(l.unitPrice, data.currency)}</Text>
            <Text style={s.c3}>{money(l.total, data.currency)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text>Sous-total</Text>
            <Text>{money(data.subtotal, data.currency)}</Text>
          </View>
          {Number(data.discount) > 0 && (
            <View style={s.totalRow}>
              <Text>Remise</Text>
              <Text>- {money(data.discount, data.currency)}</Text>
            </View>
          )}
          <View style={s.grand}>
            <Text>Total {data.currency}</Text>
            <Text>{money(data.total, data.currency)}</Text>
          </View>
          {!isQuote && (
            <>
              <View style={s.totalRow}>
                <Text>Déjà réglé</Text>
                <Text>{money(data.paid ?? 0, data.currency)}</Text>
              </View>
              <View style={[s.totalRow, s.bold]}>
                <Text>Reste à payer</Text>
                <Text>{money(balance, data.currency)}</Text>
              </View>
            </>
          )}
        </View>

        {data.notes && (
          <View style={s.notes}>
            <Text>{data.notes}</Text>
          </View>
        )}
        <Footer agency={data.agency} />
      </Page>
    </Document>,
  )
}

export async function renderReceipt(data: {
  agency: Agency
  receiptNumber: string
  paidAt: string
  amount: string
  currency: string
  method: string
  reference: string | null
  client: Party
  invoiceNumber: string
  invoiceTotal: string
  invoiceCurrency: string
  balance: number
  cashier: string | null
}) {
  return renderToBuffer(
    <Document title={`Reçu ${data.receiptNumber}`} author={data.agency.name}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <Header agency={data.agency} title="REÇU" number={data.receiptNumber} />
        <View style={s.row}>
          <View style={s.box}>
            <Text style={s.label}>Reçu de</Text>
            <Text style={s.bold}>{data.client.name}</Text>
            {data.client.lines.filter(Boolean).map((l) => (
              <Text key={l as string} style={s.small}>
                {l}
              </Text>
            ))}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Montant reçu</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY }}>{money(data.amount, data.currency)}</Text>
            <Text style={s.small}>Le {date(data.paidAt)}</Text>
            <Text style={s.small}>
              Mode : {data.method}
              {data.reference ? ` (${data.reference})` : ''}
            </Text>
          </View>
        </View>
        <Text style={s.small}>
          En règlement de la facture {data.invoiceNumber} d’un montant de {money(data.invoiceTotal, data.invoiceCurrency)}.
        </Text>
        <Text style={[s.small, s.bold, { marginTop: 4 }]}>
          Solde restant après ce paiement : {money(data.balance, data.invoiceCurrency)}
        </Text>
        {data.cashier && <Text style={[s.small, { marginTop: 16 }]}>Encaissé par : {data.cashier}</Text>}
        <Footer agency={data.agency} />
      </Page>
    </Document>,
  )
}
