/**
 * AgencyOS database schema (Supabase Postgres, via Drizzle).
 *
 * Conventions
 *  - Column names are snake_case in SQL (Drizzle `casing: "snake_case"`), camelCase in TypeScript.
 *  - IDs are text (nanoid). Public tokens are separate, longer random strings.
 *  - Every business table carries `workspace_id` and MUST be queried through `tenant()` (worker/lib/tenant.ts).
 *  - Money is stored as integers in minor units (paise / cents) in BIGINT columns – a 32-bit INTEGER
 *    would overflow at ~₹2.1 crore. Tax rates are basis points (1800 = 18%).
 *  - Instants are `timestamptz`. Calendar dates (issue date, due date…) are `date`, read as
 *    `YYYY-MM-DD` strings so they never shift with timezones.
 *  - `deleted_at` marks soft-deleted rows.
 *  - Row Level Security is ENABLED on every table with no policies. The Worker connects as the
 *    database owner (which bypasses RLS), while Supabase's auto-generated Data API (anon /
 *    authenticated roles) is denied everything. Never add a table without `.enableRLS()`.
 */
import { relations } from "drizzle-orm";
import { bigint, boolean, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import {
  ACTIVITY_TYPES,
  COMMENT_AUTHOR_TYPES,
  CONTRACT_STATUSES,
  CURRENCY_CODES,
  DEFAULT_BRAND_COLOR,
  DISCOUNT_TYPES,
  FILE_KINDS,
  INVOICE_STATUSES,
  NOTIFICATION_TYPES,
  PAYMENT_METHODS,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  ROLES,
  SIGNATURE_METHODS,
  SIGNER_ROLES,
  STEP_STATUSES,
  TAX_MODES,
} from "../../shared/constants";
import { newId } from "../lib/ids";

/* ------------------------------------------------------------------------------------------------
 * Column helpers
 * ---------------------------------------------------------------------------------------------- */

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => newId());

const createdAt = () =>
  timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  timestamp({ withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

const deletedAt = () => timestamp({ withTimezone: true, mode: "date" });

/** Amount in minor units (paise). BIGINT in Postgres, a plain `number` in TypeScript (safe to 2^53). */
const money = () => bigint({ mode: "number" }).notNull().default(0);

/** Calendar date without a time or timezone, as a `YYYY-MM-DD` string. */
const day = () => date({ mode: "string" });

const workspaceRef = () =>
  text()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

/* ------------------------------------------------------------------------------------------------
 * Identity & tenancy
 * ---------------------------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Google's stable subject identifier – the only credential we hold. */
    googleSub: text().notNull(),
    email: text().notNull(),
    name: text().notNull(),
    avatarUrl: text(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("users_google_sub_uq").on(t.googleSub), uniqueIndex("users_email_uq").on(t.email)],
).enableRLS();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text().notNull(),
  /** R2 object key of the logo, e.g. `ws/<id>/logo/<file>`. */
  logoKey: text(),
  currency: text({ enum: CURRENCY_CODES }).notNull().default("INR"),
  gstNumber: text(),
  address: text(),
  phone: text(),
  email: text(),
  website: text(),
  brandColor: text().notNull().default(DEFAULT_BRAND_COLOR),

  // Invoice defaults
  invoicePrefix: text().notNull().default("INV"),
  invoiceNextNumber: integer().notNull().default(1),
  invoiceDueDays: integer().notNull().default(15),
  invoiceNotes: text(),
  invoiceTerms: text(),
  bankDetails: text(),
  upiId: text(),
  defaultTaxMode: text({ enum: TAX_MODES }).notNull().default("none"),
  defaultTaxRate: integer().notNull().default(1800),

  // WhatsApp message templates (NULL → shared defaults)
  waInvoiceTemplate: text(),
  waContractTemplate: text(),
  waInviteTemplate: text(),

  onboardedAt: timestamp({ withTimezone: true, mode: "date" }),
  ...timestamps(),
  deletedAt: deletedAt(),
}).enableRLS();

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token – the raw token is never stored. */
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeWorkspaceId: text().references(() => workspaces.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
).enableRLS();

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: id(),
    workspaceId: workspaceRef(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: ROLES }).notNull().default("member"),
    designation: text(),
    phone: text(),
    /** Owner/admin-only: used for profit calculations. */
    monthlyCost: bigint({ mode: "number" }),
    hourlyRate: bigint({ mode: "number" }),
    ...timestamps(),
    removedAt: timestamp({ withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("workspace_members_ws_user_uq").on(t.workspaceId, t.userId),
    index("workspace_members_user_idx").on(t.userId),
  ],
).enableRLS();

export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: workspaceRef(),
    email: text().notNull(),
    role: text({ enum: ROLES }).notNull().default("member"),
    designation: text(),
    token: text().notNull(),
    invitedBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    acceptedAt: timestamp({ withTimezone: true, mode: "date" }),
    revokedAt: timestamp({ withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_uq").on(t.token), index("invites_ws_idx").on(t.workspaceId)],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Clients & projects
 * ---------------------------------------------------------------------------------------------- */

export const clients = pgTable(
  "clients",
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text().notNull(),
    company: text(),
    email: text(),
    /** Stored with country code, e.g. "+91 98765 43210". */
    whatsapp: text(),
    gstNumber: text(),
    address: text(),
    /** Internal only – never exposed on public pages. */
    notes: text(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("clients_ws_idx").on(t.workspaceId)],
).enableRLS();

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: workspaceRef(),
    clientId: text().references(() => clients.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text(),
    startDate: day(),
    dueDate: day(),
    budget: money(),
    status: text({ enum: PROJECT_STATUSES }).notNull().default("lead"),
    priority: text({ enum: PROJECT_PRIORITIES }).notNull().default("medium"),
    tags: jsonb().$type<string[]>().notNull().default([]),
    /** Ordering within a kanban column. */
    position: doublePrecision().notNull().default(0),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("projects_ws_idx").on(t.workspaceId),
    index("projects_ws_status_idx").on(t.workspaceId, t.status),
    index("projects_client_idx").on(t.clientId),
  ],
).enableRLS();

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberId: text()
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("project_members_project_member_uq").on(t.projectId, t.memberId),
    index("project_members_ws_idx").on(t.workspaceId),
    index("project_members_member_idx").on(t.memberId),
  ],
).enableRLS();

export const projectSteps = pgTable(
  "project_steps",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    dueDate: day(),
    status: text({ enum: STEP_STATUSES }).notNull().default("pending"),
    assigneeId: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    /** Optional milestone amount – pre-fills invoice line items. */
    amount: bigint({ mode: "number" }),
    position: doublePrecision().notNull().default(0),
    completedAt: timestamp({ withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    index("project_steps_ws_idx").on(t.workspaceId),
    index("project_steps_project_idx").on(t.projectId),
    index("project_steps_assignee_idx").on(t.assigneeId),
  ],
).enableRLS();

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stepId: text().references(() => projectSteps.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text(),
    assigneeId: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    dueDate: day(),
    done: boolean().notNull().default(false),
    doneAt: timestamp({ withTimezone: true, mode: "date" }),
    position: doublePrecision().notNull().default(0),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("tasks_ws_idx").on(t.workspaceId),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId),
  ],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Files (R2 metadata)
 * ---------------------------------------------------------------------------------------------- */

export const files = pgTable(
  "files",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text().references(() => projects.id, { onDelete: "set null" }),
    kind: text({ enum: FILE_KINDS }).notNull(),
    r2Key: text().notNull(),
    name: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    /** Only files explicitly shared appear on the client portal. */
    sharedWithClient: boolean().notNull().default(false),
    uploadedBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("files_ws_idx").on(t.workspaceId),
    index("files_project_idx").on(t.projectId),
    uniqueIndex("files_r2_key_uq").on(t.r2Key),
  ],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Finance: expenses, invoices, payments
 * ---------------------------------------------------------------------------------------------- */

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text().notNull(),
    color: text().notNull().default("#94a3b8"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_ws_name_uq").on(t.workspaceId, t.name)],
).enableRLS();

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    workspaceId: workspaceRef(),
    /** NULL → general (non-project) expense. */
    projectId: text().references(() => projects.id, { onDelete: "set null" }),
    categoryId: text().references(() => expenseCategories.id, { onDelete: "set null" }),
    description: text().notNull(),
    vendor: text(),
    amount: money(),
    date: day().notNull(),
    receiptFileId: text().references(() => files.id, { onDelete: "set null" }),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("expenses_ws_date_idx").on(t.workspaceId, t.date),
    index("expenses_project_idx").on(t.projectId),
    index("expenses_category_idx").on(t.categoryId),
  ],
).enableRLS();

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    workspaceId: workspaceRef(),
    clientId: text().references(() => clients.id, { onDelete: "set null" }),
    projectId: text().references(() => projects.id, { onDelete: "set null" }),
    /** Human-readable number, e.g. "INV-0042". Unique per workspace. */
    number: text().notNull(),
    sequence: integer().notNull(),
    status: text({ enum: INVOICE_STATUSES }).notNull().default("draft"),
    issueDate: day().notNull(),
    dueDate: day().notNull(),
    currency: text({ enum: CURRENCY_CODES }).notNull().default("INR"),

    discountType: text({ enum: DISCOUNT_TYPES }).notNull().default("none"),
    /** Basis points when percent, minor units when fixed. */
    discountValue: bigint({ mode: "number" }).notNull().default(0),
    taxMode: text({ enum: TAX_MODES }).notNull().default("none"),
    taxRate: integer().notNull().default(0),

    // Denormalised totals, recomputed server-side on every write.
    subtotal: money(),
    discountAmount: money(),
    taxAmount: money(),
    total: money(),
    amountPaid: money(),

    notes: text(),
    terms: text(),
    bankDetails: text(),
    upiId: text(),

    /** Unguessable token for /i/:token. Regenerating it revokes the old link. */
    publicToken: text().notNull(),
    sentAt: timestamp({ withTimezone: true, mode: "date" }),
    viewedAt: timestamp({ withTimezone: true, mode: "date" }),
    paidAt: timestamp({ withTimezone: true, mode: "date" }),
    cancelledAt: timestamp({ withTimezone: true, mode: "date" }),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("invoices_ws_number_uq").on(t.workspaceId, t.number),
    uniqueIndex("invoices_public_token_uq").on(t.publicToken),
    index("invoices_ws_status_idx").on(t.workspaceId, t.status),
    index("invoices_ws_issue_date_idx").on(t.workspaceId, t.issueDate),
    index("invoices_client_idx").on(t.clientId),
    index("invoices_project_idx").on(t.projectId),
  ],
).enableRLS();

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: id(),
    workspaceId: workspaceRef(),
    invoiceId: text()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text().notNull(),
    quantity: doublePrecision().notNull().default(1),
    rate: money(),
    amount: money(),
    position: integer().notNull().default(0),
  },
  (t) => [index("invoice_items_ws_idx").on(t.workspaceId), index("invoice_items_invoice_idx").on(t.invoiceId)],
).enableRLS();

export const payments = pgTable(
  "payments",
  {
    id: id(),
    workspaceId: workspaceRef(),
    invoiceId: text()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: money(),
    date: day().notNull(),
    method: text({ enum: PAYMENT_METHODS }).notNull().default("upi"),
    reference: text(),
    notes: text(),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("payments_ws_date_idx").on(t.workspaceId, t.date), index("payments_invoice_idx").on(t.invoiceId)],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Contracts & e-signatures
 * ---------------------------------------------------------------------------------------------- */

export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text().notNull(),
    /** Sanitised HTML containing {variable} placeholders. */
    content: text().notNull(),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [index("contract_templates_ws_idx").on(t.workspaceId)],
).enableRLS();

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text().references(() => projects.id, { onDelete: "set null" }),
    clientId: text().references(() => clients.id, { onDelete: "set null" }),
    templateId: text().references(() => contractTemplates.id, { onDelete: "set null" }),
    title: text().notNull(),
    /** Sanitised HTML with variables already substituted. Immutable once `lockedAt` is set. */
    content: text().notNull(),
    version: integer().notNull().default(1),
    /** Previous version this contract supersedes (a signed contract can only be changed via a new version). */
    previousVersionId: text(),
    status: text({ enum: CONTRACT_STATUSES }).notNull().default("draft"),
    publicToken: text().notNull(),
    /** SHA-256 (hex) of `content` at the moment of the first signature. */
    contentHash: text(),
    sentAt: timestamp({ withTimezone: true, mode: "date" }),
    viewedAt: timestamp({ withTimezone: true, mode: "date" }),
    clientSignedAt: timestamp({ withTimezone: true, mode: "date" }),
    completedAt: timestamp({ withTimezone: true, mode: "date" }),
    lockedAt: timestamp({ withTimezone: true, mode: "date" }),
    signedPdfFileId: text().references(() => files.id, { onDelete: "set null" }),
    createdBy: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    ...timestamps(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("contracts_public_token_uq").on(t.publicToken),
    index("contracts_ws_idx").on(t.workspaceId),
    index("contracts_project_idx").on(t.projectId),
  ],
).enableRLS();

/** Append-only audit trail: one row per signature event. */
export const signatures = pgTable(
  "signatures",
  {
    id: id(),
    workspaceId: workspaceRef(),
    contractId: text()
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    signerRole: text({ enum: SIGNER_ROLES }).notNull(),
    signerName: text().notNull(),
    signerEmail: text(),
    signerUserId: text().references(() => users.id, { onDelete: "set null" }),
    method: text({ enum: SIGNATURE_METHODS }).notNull(),
    /** R2 key of the signature image (PNG). */
    signatureKey: text().notNull(),
    ip: text(),
    userAgent: text(),
    /** SHA-256 (hex) of the exact contract content that was signed. */
    contentHash: text().notNull(),
    signedAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("signatures_ws_idx").on(t.workspaceId), index("signatures_contract_idx").on(t.contractId)],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Client portal
 * ---------------------------------------------------------------------------------------------- */

export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Unguessable token for /p/:token. Regenerating it revokes the old link. */
    token: text().notNull(),
    enabled: boolean().notNull().default(true),
    showInvoices: boolean().notNull().default(true),
    showContract: boolean().notNull().default(true),
    showFiles: boolean().notNull().default(true),
    allowComments: boolean().notNull().default(true),
    viewCount: integer().notNull().default(0),
    lastViewedAt: timestamp({ withTimezone: true, mode: "date" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("share_links_token_uq").on(t.token),
    uniqueIndex("share_links_project_uq").on(t.projectId),
    index("share_links_ws_idx").on(t.workspaceId),
  ],
).enableRLS();

export const comments = pgTable(
  "comments",
  {
    id: id(),
    workspaceId: workspaceRef(),
    projectId: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorType: text({ enum: COMMENT_AUTHOR_TYPES }).notNull(),
    authorName: text().notNull(),
    authorMemberId: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("comments_ws_idx").on(t.workspaceId), index("comments_project_idx").on(t.projectId, t.createdAt)],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Activity & notifications
 * ---------------------------------------------------------------------------------------------- */

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    workspaceId: workspaceRef(),
    type: text({ enum: ACTIVITY_TYPES }).notNull(),
    /** NULL when the actor is a client (public page) or the system. */
    actorMemberId: text().references(() => workspaceMembers.id, { onDelete: "set null" }),
    actorName: text(),
    entityType: text(),
    entityId: text(),
    projectId: text().references(() => projects.id, { onDelete: "set null" }),
    /** Short, pre-rendered description, e.g. `Invoice INV-0042 was paid`. */
    summary: text().notNull(),
    /** True for money-related events that members must not see. */
    financeOnly: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_ws_created_idx").on(t.workspaceId, t.createdAt)],
).enableRLS();

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: workspaceRef(),
    /** Recipient. */
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text({ enum: NOTIFICATION_TYPES }).notNull(),
    title: text().notNull(),
    body: text(),
    /** In-app path to open, e.g. `/app/invoices/<id>`. */
    link: text(),
    readAt: timestamp({ withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_recipient_idx").on(t.workspaceId, t.userId, t.createdAt)],
).enableRLS();

/* ------------------------------------------------------------------------------------------------
 * Relations (for Drizzle's relational query API)
 * ---------------------------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  sessions: many(sessions),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  clients: many(clients),
  projects: many(projects),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
  projectAssignments: many(projectMembers),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
  invoices: many(invoices),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  members: many(projectMembers),
  steps: many(projectSteps),
  tasks: many(tasks),
  expenses: many(expenses),
  invoices: many(invoices),
  contracts: many(contracts),
  files: many(files),
  comments: many(comments),
  shareLink: one(shareLinks, { fields: [projects.id], references: [shareLinks.projectId] }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  member: one(workspaceMembers, { fields: [projectMembers.memberId], references: [workspaceMembers.id] }),
}));

export const projectStepsRelations = relations(projectSteps, ({ one, many }) => ({
  project: one(projects, { fields: [projectSteps.projectId], references: [projects.id] }),
  assignee: one(workspaceMembers, { fields: [projectSteps.assigneeId], references: [workspaceMembers.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  step: one(projectSteps, { fields: [tasks.stepId], references: [projectSteps.id] }),
  assignee: one(workspaceMembers, { fields: [tasks.assigneeId], references: [workspaceMembers.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  project: one(projects, { fields: [expenses.projectId], references: [projects.id] }),
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
  receipt: one(files, { fields: [expenses.receiptFileId], references: [files.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  project: one(projects, { fields: [contracts.projectId], references: [projects.id] }),
  client: one(clients, { fields: [contracts.clientId], references: [clients.id] }),
  template: one(contractTemplates, { fields: [contracts.templateId], references: [contractTemplates.id] }),
  signatures: many(signatures),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  contract: one(contracts, { fields: [signatures.contractId], references: [contracts.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  project: one(projects, { fields: [files.projectId], references: [projects.id] }),
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  project: one(projects, { fields: [shareLinks.projectId], references: [projects.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  project: one(projects, { fields: [comments.projectId], references: [projects.id] }),
}));
