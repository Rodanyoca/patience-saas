import { sql } from 'drizzle-orm'
import {
  customType,
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
  unique,
  index,
  foreignKey,
  check,
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
}, (t) => [index('session_user_idx').on(t.userId)])

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
}, (t) => [index('account_user_idx').on(t.userId)])

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


export const branches = pgTable('branches', {
 id: text('id').primaryKey(), code: text('code').notNull().unique(), name: text('name').notNull(),
 description: text('description'), active: boolean('active').notNull().default(true),
 createdAt: timestamp('created_at').notNull().defaultNow(), updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [check('branches_code_check', sql`${t.code} ~ '^[A-Z][A-Z0-9-]{1,39}$'`), check('branches_name_check', sql`length(trim(${t.name})) between 1 and 160`)])
export const branchMemberships = pgTable('branch_memberships', {
 userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
 branchId: text('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
}, (t) => [primaryKey({columns:[t.userId,t.branchId]})])
export const prestationTypes = pgTable('prestation_types', {
 id: text('id').primaryKey(), branchId: text('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
 code: text('code').notNull().unique(), name: text('name').notNull(), description: text('description'),
 formType: text('form_type').$type<'generic'|'visa'|'flight'|'hotel'|'insurance'>().notNull().default('generic'),
 legacyType: text('legacy_type').unique(), active: boolean('active').notNull().default(true),
 displayOrder: integer('display_order').notNull().default(0),
 createdAt: timestamp('created_at').notNull().defaultNow(), updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
 unique('prestation_types_id_branch_id_key').on(t.id,t.branchId),
 index('prestation_types_branch_active_order_idx').on(t.branchId,t.active,t.displayOrder,t.name),
 check('prestation_types_code_check', sql`${t.code} ~ '^[A-Z][A-Z0-9-]{1,39}$'`),
 check('prestation_types_name_check', sql`length(trim(${t.name})) between 1 and 160`),
 check('prestation_types_form_type_check', sql`${t.formType} in ('generic','visa','flight','hotel','insurance')`),
 check('prestation_types_legacy_type_check', sql`${t.legacyType} in ('visa','billet','hotel','assurance')`),
 check('prestation_types_display_order_check', sql`${t.displayOrder} >= 0`),
])

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
  passportNumber: text('passport_number'),
  passportExpiry: date('passport_expiry'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('clients_created_idx').on(t.createdAt)])

export const dossiers = pgTable('dossiers', {
  branchId: text('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
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
}, (t) => [index('dossiers_client_idx').on(t.clientId), index('dossiers_branch_status_updated_idx').on(t.branchId,t.status,t.updatedAt), unique('dossiers_id_branch_unique').on(t.id,t.branchId), index('dossiers_branch_idx').on(t.branchId)])

export const dossierSteps = pgTable('dossier_steps', {
  id: serial('id').primaryKey(),
  dossierId: integer('dossier_id').notNull().references(() => dossiers.id, { onDelete: 'restrict' }),
  label: text('label').notNull(),
  note: text('note'),
  userId: text('user_id'),
  userName: text('user_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('dossier_steps_dossier_created_idx').on(t.dossierId,t.createdAt)])

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
  branchId: text('branch_id').notNull(),
  prestationTypeId: text('prestation_type_id'),
  id: serial('id').primaryKey(),
  dossierId: integer('dossier_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  supplierId: integer('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
  description: text('description').notNull(),
  costPrice: numeric('cost_price', { precision: 14, scale: 2 }).notNull().default('0'),
  salePrice: numeric('sale_price', { precision: 14, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('services_dossier_idx').on(t.dossierId), index('services_supplier_idx').on(t.supplierId),
 foreignKey({name:'services_dossier_branch_fk',columns:[t.dossierId,t.branchId],foreignColumns:[dossiers.id,dossiers.branchId]}).onDelete('restrict'),
 foreignKey({name:'services_catalog_branch_fk',columns:[t.prestationTypeId,t.branchId],foreignColumns:[prestationTypes.id,prestationTypes.branchId]}).onDelete('restrict'),
 index('services_catalog_idx').on(t.prestationTypeId),
 index('services_branch_catalog_status_idx').on(t.branchId,t.prestationTypeId,t.status),
])

export const commercialDocs = pgTable('commercial_docs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(),
  number: text('number').notNull().unique(),
  dossierId: integer('dossier_id').notNull().references(() => dossiers.id, { onDelete: 'restrict' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
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
  snapshot: jsonb('snapshot').$type<import('@/lib/commercial-snapshot').CommercialSnapshot>(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('commercial_docs_dossier_idx').on(t.dossierId), index('commercial_docs_client_idx').on(t.clientId), index('commercial_docs_kind_issue_idx').on(t.kind,t.issueDate)])

export const docLines = pgTable('doc_lines', {
  id: serial('id').primaryKey(),
  docId: integer('doc_id').notNull().references(() => commercialDocs.id, { onDelete: 'restrict' }),
  serviceId: integer('service_id').references(() => services.id, { onDelete: 'restrict' }),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  position: integer('position').notNull().default(0),
}, (t) => [index('doc_lines_doc_position_idx').on(t.docId,t.position), index('doc_lines_service_idx').on(t.serviceId)])

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull().unique(),
  requestKey: text('request_key').unique(),
  invoiceId: integer('invoice_id').notNull().references(() => commercialDocs.id, { onDelete: 'restrict' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  dossierId: integer('dossier_id').notNull().references(() => dossiers.id, { onDelete: 'restrict' }),
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
}, (t) => [index('payments_invoice_idx').on(t.invoiceId), index('payments_dossier_idx').on(t.dossierId), index('payments_paid_idx').on(t.paidAt)])

export const supplierPayments = pgTable('supplier_payments', {
  id: serial('id').primaryKey(),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
  serviceId: integer('service_id').references(() => services.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull().default('1'),
  method: text('method').notNull(),
  reference: text('reference'),
  paidAt: date('paid_at').notNull().defaultNow(),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('supplier_payments_supplier_idx').on(t.supplierId), index('supplier_payments_paid_idx').on(t.paidAt)])

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
}, (t) => [index('expenses_paid_idx').on(t.paidAt)])

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
}, (t) => [index('cash_movements_occurred_idx').on(t.occurredAt)])

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  userName: text('user_name'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('audit_logs_created_idx').on(t.createdAt)])

const binary=customType<{data:Buffer;driverData:Buffer}>({dataType(){return 'bytea'}})
export const generatedDocuments=pgTable('generated_documents',{
 docId:integer('doc_id').primaryKey().references(()=>commercialDocs.id,{onDelete:'cascade'}),
 fingerprint:text('fingerprint').notNull(),content:binary('content').notNull(),createdAt:timestamp('created_at').notNull().defaultNow(),
})
