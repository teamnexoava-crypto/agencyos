import type {
  ActivityType,
  ContractStatus,
  CurrencyCode,
  DiscountType,
  InvoiceStatus,
  LeadMapField,
  LeadNoteKind,
  LeadStage,
  NotificationType,
  PaymentMethod,
  ProjectPriority,
  ProjectStatus,
  Role,
  SignatureMethod,
  SignerRole,
  StepStatus,
  TaxMode,
} from "./constants";
import type { BillingCycle, BillingPaymentStatus, BillingStatus, PlanId, PlanLimits } from "./plans";

/** Shape of every non-2xx API response body. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level validation messages keyed by dotted path. */
    fields?: Record<string, string>;
  };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  logoUrl: string | null;
  currency: CurrencyCode;
  gstNumber: string | null;
  address: string | null;
  phone: string | null;
  invoicePrefix: string;
  invoiceNextNumber: number;
  brandColor: string;
  defaultTaxMode: TaxMode;
  /** Basis points – 1800 = 18%. */
  defaultTaxRate: number;
  onboarded: boolean;
  createdAt: number;
}

export interface MembershipDTO {
  id: string;
  role: Role;
  designation: string | null;
}

export interface MeResponse {
  user: SessionUser;
  /** `null` when the user has been removed from every workspace. */
  workspace: WorkspaceDTO | null;
  membership: MembershipDTO | null;
  /** Trial / plan state of the workspace; `null` when there is no workspace. */
  billing: BillingDTO | null;
  /** Must be echoed in the `X-CSRF-Token` header on every state-changing request. */
  csrfToken: string;
}

/** Where a workspace stands with its trial and plan. */
export interface BillingDTO {
  /** False until online payments are switched on: nothing is limited or locked. */
  enabled: boolean;
  status: BillingStatus;
  /** The plan last paid for; `null` before the first payment. */
  plan: PlanId | null;
  trialEndsAt: number;
  paidUntil: number | null;
  /** Whole days left in the trial or the paid period; `null` when neither is running. */
  daysLeft: number | null;
  limits: PlanLimits;
}

export interface BillingPaymentDTO {
  id: string;
  plan: PlanId;
  cycle: BillingCycle;
  /** Paise. */
  amount: number;
  status: BillingPaymentStatus;
  createdAt: number;
  paidAt: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  paidBy: string;
}

export interface BillingUsage {
  members: number;
  sheets: number;
  contractsThisMonth: number;
  storageBytes: number;
}

export interface BillingOverview {
  billing: BillingDTO;
  usage: BillingUsage;
  payments: BillingPaymentDTO[];
}

export interface AuthConfigResponse {
  googleConfigured: boolean;
  /** True only under `npm run dev` on localhost. */
  devLogin: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Members, clients, projects
 * ---------------------------------------------------------------------------------------------- */

export interface MemberSummary {
  /** workspace_members id – the id used for assignments. */
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  designation: string | null;
}

export interface ClientDTO {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  whatsapp: string | null;
  gstNumber: string | null;
  address: string | null;
  notes: string | null;
  projectCount: number;
  createdAt: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string | null;
  dueDate: string | null;
  /** Minor units. `null` when the viewer may not see finances (members). */
  budget: number | null;
  tags: string[];
  position: number;
  /** 0–100, derived from completed steps. */
  progress: number;
  stepCount: number;
  stepsDone: number;
  taskCount: number;
  tasksDone: number;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface StepDTO {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: StepStatus;
  assigneeId: string | null;
  /** Minor units. `null` when unset or hidden from the viewer. */
  amount: number | null;
  position: number;
  completedAt: number | null;
}

export interface TaskDTO {
  id: string;
  title: string;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
  doneAt: number | null;
  position: number;
  createdAt: number;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  steps: StepDTO[];
  tasks: TaskDTO[];
  /** Null for members. */
  finance: ProjectFinance | null;
}

export interface ClientDetail extends ClientDTO {
  projects: ProjectSummary[];
  /** Minor units; filled in once invoicing exists. */
  totals: { billed: number; paid: number };
}

/* ------------------------------------------------------------------------------------------------
 * Team
 * ---------------------------------------------------------------------------------------------- */

export interface TeamMemberDTO extends MemberSummary {
  phone: string | null;
  /** Minor units. Always null for viewers who may not see finances. */
  monthlyCost: number | null;
  hourlyRate: number | null;
  projectCount: number;
  openTasks: number;
  joinedAt: number;
}

export interface InviteDTO {
  id: string;
  email: string;
  role: Role;
  designation: string | null;
  /** The secret part of the invite link: /invite/<token>. */
  token: string;
  invitedByName: string | null;
  expiresAt: number;
  createdAt: number;
}

export interface TeamResponse {
  members: TeamMemberDTO[];
  /** Pending invites – only sent to owners and admins. */
  invites: InviteDTO[];
  /** Workspace's WhatsApp invite message template. */
  inviteTemplate: string;
}

export interface AssignedTask extends TaskDTO {
  projectId: string;
  projectTitle: string;
}

export interface AssignedStep extends StepDTO {
  projectId: string;
  projectTitle: string;
}

export interface MemberDetail {
  member: TeamMemberDTO;
  projects: ProjectSummary[];
  /** Open tasks assigned to this person, soonest due first. */
  tasks: AssignedTask[];
  /** Steps assigned to this person that aren't completed yet. */
  steps: AssignedStep[];
}

export type InviteState = "valid" | "expired" | "revoked" | "accepted" | "not_found";

export interface InvitePreview {
  state: InviteState;
  workspaceName: string | null;
  workspaceLogoUrl: string | null;
  inviterName: string | null;
  /** The address the invite was sent to – the Google account used to accept must match it. */
  email: string | null;
  role: Role | null;
}

export interface WorkspaceMembershipDTO {
  workspaceId: string;
  name: string;
  logoUrl: string | null;
  role: Role;
  active: boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Invoices
 * ---------------------------------------------------------------------------------------------- */

export interface InvoiceListItem {
  id: string;
  number: string;
  status: InvoiceStatus;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  total: number;
  amountPaid: number;
}

export interface InvoiceItemDTO {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface PaymentDTO {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdAt: number;
}

/** The parties and content printed on an invoice – identical for the app, the PDF and the public page. */
export interface InvoiceDocument {
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  items: InvoiceItemDTO[];
  discountType: DiscountType;
  discountValue: number;
  taxMode: TaxMode;
  taxRate: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  terms: string | null;
  bankDetails: string | null;
  upiId: string | null;
  projectTitle: string | null;
  from: { name: string; logoUrl: string | null; address: string | null; gstNumber: string | null; phone: string | null; email: string | null; brandColor: string };
  to: { name: string; company: string | null; address: string | null; gstNumber: string | null; email: string | null };
}

export interface InvoiceDetail extends InvoiceDocument {
  id: string;
  clientId: string | null;
  projectId: string | null;
  /** Client's WhatsApp number for one-tap sharing. */
  clientWhatsapp: string | null;
  publicToken: string;
  payments: PaymentDTO[];
  sentAt: number | null;
  viewedAt: number | null;
  paidAt: number | null;
  createdAt: number;
  /** Workspace's WhatsApp message template for invoices. */
  messageTemplate: string;
}

/** Prefill values for a new invoice. */
export interface InvoiceDefaults {
  nextNumber: string;
  dueDays: number;
  taxMode: TaxMode;
  taxRate: number;
  notes: string | null;
  terms: string | null;
  bankDetails: string | null;
  upiId: string | null;
}

export interface InvoiceSummary {
  /** Unpaid balance across sent invoices. */
  outstanding: number;
  overdue: number;
  overdueCount: number;
  /** Payments received in the current calendar month. */
  collectedThisMonth: number;
  draftCount: number;
}

/* ------------------------------------------------------------------------------------------------
 * Finance: expenses, dashboard, profit & loss
 * ---------------------------------------------------------------------------------------------- */

export interface ExpenseCategoryDTO {
  id: string;
  name: string;
  color: string;
}

export interface ExpenseDTO {
  id: string;
  description: string;
  amount: number;
  date: string;
  vendor: string | null;
  categoryId: string | null;
  categoryName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  /** Present when a receipt is attached – download from /api/files/<id>. */
  receipt: { fileId: string; name: string } | null;
}

export interface MonthlyPoint {
  /** YYYY-MM */
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  summary: string;
  projectId: string | null;
  createdAt: number;
}

export interface DeadlineItem {
  kind: "project" | "step" | "task";
  id: string;
  title: string;
  projectId: string;
  projectTitle: string;
  dueDate: string;
}

export interface DashboardData {
  /** Money figures – null for members, who never see finances. */
  finance: {
    revenue: number;
    expenses: number;
    profit: number;
    /** Unpaid balance on sent invoices, as of now (not limited to the selected range). */
    outstanding: number;
    monthly: MonthlyPoint[];
    topClients: { clientId: string; name: string; revenue: number }[];
    overdueInvoices: { id: string; number: string; clientName: string | null; dueDate: string; balance: number }[];
  } | null;
  activeProjects: number;
  teamSize: number;
  /** For members: their own open tasks. */
  myOpenTasks: number;
  projectStatus: Record<ProjectStatus, number>;
  deadlines: DeadlineItem[];
  activity: ActivityItem[];
  /** True until the workspace has its first client or project – drives the "get started" checklist. */
  isEmpty: boolean;
}

export interface ProfitAndLoss {
  totals: { revenue: number; expenses: number; profit: number };
  byMonth: MonthlyPoint[];
  byProject: { projectId: string | null; title: string; clientName: string | null; revenue: number; expenses: number; profit: number }[];
  byClient: { clientId: string | null; name: string; revenue: number; expenses: number; profit: number }[];
  byCategory: { categoryId: string | null; name: string; color: string; amount: number }[];
  /** Sum of active members' monthly cost – lets the UI estimate salaries when they aren't logged as expenses. */
  teamMonthlyCost: number;
}

/** Money summary for one project (owner/admin only). */
export interface ProjectFinance {
  invoiced: number;
  received: number;
  expenses: number;
  /** received − expenses */
  profit: number;
}

/* ------------------------------------------------------------------------------------------------
 * Contracts & e-signatures
 * ---------------------------------------------------------------------------------------------- */

export interface ContractTemplateDTO {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}

export interface ContractListItem {
  id: string;
  title: string;
  status: ContractStatus;
  version: number;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  sentAt: number | null;
  completedAt: number | null;
  updatedAt: number;
}

/** One entry of the audit trail. */
export interface ContractSignatureDTO {
  role: SignerRole;
  name: string;
  email: string | null;
  method: SignatureMethod;
  /** The signature itself, as a PNG data URI. */
  image: string;
  signedAt: number;
  ip: string | null;
  userAgent: string | null;
  /** SHA-256 of the exact text that was signed. */
  contentHash: string;
}

/** Everything printed on a contract – the same for the app and the public signing page. */
export interface ContractDocument {
  reference: string;
  title: string;
  /** Sanitised HTML. */
  content: string;
  status: ContractStatus;
  version: number;
  /** SHA-256 of `content` as it is right now. */
  contentHash: string;
  agency: { name: string; logoUrl: string | null; brandColor: string; address: string | null; email: string | null; phone: string | null };
  client: { name: string; company: string | null; email: string | null };
  projectTitle: string | null;
  sentAt: number | null;
  viewedAt: number | null;
  completedAt: number | null;
  signatures: ContractSignatureDTO[];
}

export interface ContractDetail extends ContractDocument {
  id: string;
  clientId: string | null;
  projectId: string | null;
  publicToken: string;
  clientWhatsapp: string | null;
  createdAt: number;
  updatedAt: number;
  /** The newer version that replaced this one, if any. */
  nextVersionId: string | null;
  previousVersionId: string | null;
  /** File id of the sealed signed copy (present once both parties have signed). */
  signedFileId: string | null;
  messageTemplate: string;
}

/* ------------------------------------------------------------------------------------------------
 * Project files, client link and the client portal
 * ---------------------------------------------------------------------------------------------- */

export interface ProjectFileDTO {
  id: string;
  name: string;
  contentType: string;
  size: number;
  sharedWithClient: boolean;
  uploadedBy: string | null;
  createdAt: number;
}

export interface ShareLinkDTO {
  token: string;
  enabled: boolean;
  showInvoices: boolean;
  showContract: boolean;
  showFiles: boolean;
  allowComments: boolean;
  viewCount: number;
  lastViewedAt: number | null;
}

export interface CommentDTO {
  id: string;
  authorType: "client" | "member";
  authorName: string;
  body: string;
  createdAt: number;
}

/** Everything the client portal shows. Hand-picked, client-safe fields only – no costs, notes, team or internal ids. */
export interface PortalData {
  agency: { name: string; logoUrl: string | null; brandColor: string; email: string | null; phone: string | null };
  clientName: string | null;
  project: { title: string; status: ProjectStatus; startDate: string | null; dueDate: string | null; progress: number };
  steps: { title: string; status: StepStatus; dueDate: string | null; completedAt: number | null }[];
  /** `null` when the agency has switched this section off. */
  invoices: { number: string; status: InvoiceStatus; issueDate: string; dueDate: string; total: number; amountPaid: number; currency: CurrencyCode; token: string }[] | null;
  contracts: { title: string; status: ContractStatus; token: string }[] | null;
  files: { id: string; name: string; contentType: string; size: number; createdAt: number }[] | null;
  comments: CommentDTO[] | null;
}

/* ------------------------------------------------------------------------------------------------
 * Settings, notifications and search
 * ---------------------------------------------------------------------------------------------- */

export interface WorkspaceSettings {
  name: string;
  logoUrl: string | null;
  currency: CurrencyCode;
  email: string;
  phone: string;
  website: string;
  address: string;
  gstNumber: string;
  brandColor: string;
  invoicePrefix: string;
  invoiceNextNumber: number;
  /** The lowest number the counter can be set to (one above the highest invoice already issued). */
  invoiceMinNextNumber: number;
  invoiceDueDays: number;
  defaultTaxMode: TaxMode;
  defaultTaxRate: number;
  invoiceNotes: string;
  invoiceTerms: string;
  bankDetails: string;
  upiId: string;
  /** "" when the built-in message is in use. */
  waInvoiceTemplate: string;
  waContractTemplate: string;
  waInviteTemplate: string;
  defaults: { waInvoiceTemplate: string; waContractTemplate: string; waInviteTemplate: string };
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: number;
}

export interface NotificationFeed {
  notifications: NotificationDTO[];
  unread: number;
}

export interface SearchResult {
  type: "project" | "client" | "invoice" | "contract" | "lead";
  id: string;
  title: string;
  subtitle: string | null;
  /** In-app path. */
  to: string;
}

/* ------------------------------------------------------------------------------------------------
 * CRM
 * ---------------------------------------------------------------------------------------------- */

export interface LeadDTO {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  /** Minor units. Always null for members. */
  value: number | null;
  assigneeId: string | null;
  followUpDate: string | null;
  lastContactedAt: number | null;
  sourceLabel: string | null;
  clientId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LeadNoteDTO {
  id: string;
  kind: LeadNoteKind;
  body: string;
  authorName: string | null;
  /** True when the viewer wrote it (or may otherwise delete it). */
  canDelete: boolean;
  createdAt: number;
}

export interface LeadDetail extends LeadDTO {
  /** Sheet columns that are not mapped to a field. */
  extra: Record<string, string>;
  notes: LeadNoteDTO[];
}

export interface LeadSourceDTO {
  id: string;
  name: string;
  /** Link that opens the sheet in Google Sheets. */
  url: string;
  mapping: Partial<Record<LeadMapField, string>>;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  rowsImported: number;
}

/** What a sheet looks like before it is connected: its columns, a few rows and a suggested mapping. */
export interface SheetPreview {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  suggestedMapping: Partial<Record<LeadMapField, string>>;
}

export interface SyncResult {
  source: LeadSourceDTO;
  /** New leads created by this sync. */
  added: number;
  /** Rows already imported earlier (or empty). */
  skipped: number;
}
