import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
  date,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'

// --- Better Auth tables (camelCase columns, do not rename) -----------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  role: text('role').notNull().default('agent'),
  active: boolean('active').notNull().default(true),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// --- Agency tables -----------------------------------------------------------

export const agencySettings = pgTable('agency_settings', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  taxId: text('tax_id'),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  dossierPrefix: text('dossier_prefix').notNull().default('DOS'),
  quotePrefix: text('quote_prefix').notNull().default('DEV'),
  invoicePrefix: text('invoice_prefix').notNull().default('FAC'),
  receiptPrefix: text('receipt_prefix').notNull().default('REC'),
  clientPrefix: text('client_prefix').notNull().default('CLI'),
  documentFooter: text('document_footer'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const counters = pgTable('counters', {
  key: text('key').primaryKey(),
  value: integer('value').notNull().default(0),
})

export const currencies = pgTable('currencies', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  active: boolean('active').notNull().default(true),
})

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  type: text('type').notNull().default('particulier'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  companyName: text('company_name'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  city: text('city'),
  country: text('country'),
  nationality: text('nationality'),
  birthDate: date('birth_date'),
  passportNumber: text('passport_number'),
  passportExpiry: date('passport_expiry'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const travelers = pgTable('travelers', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  relation: text('relation').notNull().default('titulaire'),
  birthDate: date('birth_date'),
  gender: text('gender'),
  nationality: text('nationality'),
  passportNumber: text('passport_number'),
  passportExpiry: date('passport_expiry'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const dossiers = pgTable('dossiers', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  clientId: integer('client_id').notNull(),
  agentId: text('agent_id'),
  title: text('title').notNull(),
  destination: text('destination'),
  status: text('status').notNull().default('en_attente'),
  priority: text('priority').notNull().default('normale'),
  departureDate: date('departure_date'),
  returnDate: date('return_date'),
  dueDate: date('due_date'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  closedAt: timestamp('closed_at'),
})

export const dossierTravelers = pgTable(
  'dossier_travelers',
  {
    dossierId: integer('dossier_id').notNull(),
    travelerId: integer('traveler_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.dossierId, t.travelerId] })],
)

export const dossierSteps = pgTable('dossier_steps', {
  id: serial('id').primaryKey(),
  dossierId: integer('dossier_id').notNull(),
  label: text('label').notNull(),
  note: text('note'),
  userId: text('user_id'),
  userName: text('user_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('autre'),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  dossierId: integer('dossier_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  supplierId: integer('supplier_id'),
  description: text('description').notNull(),
  costPrice: numeric('cost_price', { precision: 14, scale: 2 }).notNull().default('0'),
  salePrice: numeric('sale_price', { precision: 14, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const commercialDocs = pgTable('commercial_docs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),
  number: text('number').notNull().unique(),
  dossierId: integer('dossier_id').notNull(),
  clientId: integer('client_id').notNull(),
  status: text('status').notNull(),
  issueDate: date('issue_date').notNull().defaultNow(),
  dueDate: date('due_date'),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  sourceQuoteId: integer('source_quote_id'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const docLines = pgTable('doc_lines', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull(),
  serviceId: integer('service_id'),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  position: integer('position').notNull().default(0),
})

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  invoiceId: integer('invoice_id').notNull(),
  clientId: integer('client_id').notNull(),
  dossierId: integer('dossier_id').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  appliedAmount: numeric('applied_amount', { precision: 14, scale: 2 }).notNull(),
  method: text('method').notNull(),
  reference: text('reference'),
  paidAt: date('paid_at').notNull().defaultNow(),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const supplierPayments = pgTable('supplier_payments', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull(),
  serviceId: integer('service_id'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  method: text('method').notNull(),
  reference: text('reference'),
  paidAt: date('paid_at').notNull().defaultNow(),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  method: text('method').notNull(),
  paidAt: date('paid_at').notNull().defaultNow(),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const cashMovements = pgTable('cash_movements', {
  id: serial('id').primaryKey(),
  direction: text('direction').notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  occurredAt: date('occurred_at').notNull().defaultNow(),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const files = pgTable('files', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id'),
  dossierId: integer('dossier_id'),
  category: text('category').notNull().default('autre'),
  name: text('name').notNull(),
  pathname: text('pathname').notNull(),
  contentType: text('content_type'),
  size: integer('size'),
  confidential: boolean('confidential').notNull().default(false),
  uploadedBy: text('uploaded_by'),
  uploadedByName: text('uploaded_by_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  userName: text('user_name'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
