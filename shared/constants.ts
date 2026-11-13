/**
 * Enumerations shared by the database schema, API validation and the UI.
 * Keep these as `as const` tuples so they can feed both Drizzle `enum` columns and Zod enums.
 */

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to see money: revenue, expenses, member costs, P&L. */
export const FINANCE_ROLES: readonly Role[] = ["owner", "admin"];

export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "en-IE" },
  { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", locale: "en-AE" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-SG" },
] as const;
export const CURRENCY_CODES = ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const PROJECT_STATUSES = ["lead", "in_progress", "on_hold", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const STEP_STATUSES = ["pending", "in_progress", "completed"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** "overdue" is never stored – it is derived from due_date + outstanding balance at read time. */
export const INVOICE_STATUSES = ["draft", "sent", "viewed", "partially_paid", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TAX_MODES = ["none", "cgst_sgst", "igst"] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export const DISCOUNT_TYPES = ["none", "percent", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PAYMENT_METHODS = ["upi", "bank_transfer", "cash", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONTRACT_STATUSES = ["draft", "sent", "viewed", "client_signed", "completed", "voided"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const SIGNER_ROLES = ["client", "agency"] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export const SIGNATURE_METHODS = ["drawn", "typed"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export const FILE_KINDS = ["logo", "receipt", "project_file", "signature", "signed_contract", "attachment"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const COMMENT_AUTHOR_TYPES = ["client", "member"] as const;
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];

export const ACTIVITY_TYPES = [
  "workspace.created",
  "member.invited",
  "member.joined",
  "member.removed",
  "client.created",
  "project.created",
  "project.status_changed",
  "project.completed",
  "step.completed",
  "task.assigned",
  "invoice.created",
  "invoice.sent",
  "invoice.viewed",
  "invoice.payment_recorded",
  "invoice.paid",
  "expense.created",
  "contract.created",
  "contract.sent",
  "contract.viewed",
  "contract.signed",
  "comment.created",
  "file.uploaded",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "invoice.viewed",
  "invoice.paid",
  "contract.viewed",
  "contract.signed",
  "task.assigned",
  "comment.created",
  "member.joined",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Session lifetime: 30 days, extended ("rolled") whenever less than half of it remains. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const DEFAULT_BRAND_COLOR = "#6366f1";

export const DEFAULT_WA_INVOICE_TEMPLATE =
  "Hi {client_name}, here is invoice {invoice_no} for {project} of {amount}. View & pay: {invoice_link}";
export const DEFAULT_WA_CONTRACT_TEMPLATE =
  "Hi {client_name}, please review and sign the agreement for {project}: {contract_link}";
export const DEFAULT_WA_INVITE_TEMPLATE =
  "Hi! {inviter_name} invited you to join {agency_name} on AgencyOS. Accept here: {invite_link}";
