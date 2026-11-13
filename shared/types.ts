import type { CurrencyCode, ProjectPriority, ProjectStatus, Role, StepStatus, TaxMode } from "./constants";

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
