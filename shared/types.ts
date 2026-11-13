import type { CurrencyCode, DiscountType, InvoiceStatus, PaymentMethod, ProjectPriority, ProjectStatus, Role, StepStatus, TaxMode } from "./constants";

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
  /** Must be echoed in the `X-CSRF-Token` header on every state-changing request. */
  csrfToken: string;
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
