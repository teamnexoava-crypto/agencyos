import type { CurrencyCode, Role, TaxMode } from "./constants";

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
