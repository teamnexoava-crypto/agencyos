import type { CurrencyCode } from "../../shared/constants";
import { TRIAL_DAYS, type BillingCurrency } from "../../shared/plans";
import type { MembershipDTO, SessionUser, WorkspaceDTO } from "../../shared/types";
import type { Database } from "../db";
import { activityLog, expenseCategories, workspaceMembers, workspaces } from "../db/schema";
import { newId } from "../lib/ids";
import type { MemberRow, UserRow, WorkspaceRow } from "../types";

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Salaries", color: "#6366f1" },
  { name: "Freelancers", color: "#8b5cf6" },
  { name: "Software", color: "#0ea5e9" },
  { name: "Rent", color: "#f59e0b" },
  { name: "Marketing", color: "#ec4899" },
  { name: "Travel", color: "#14b8a6" },
  { name: "Office", color: "#84cc16" },
  { name: "Taxes & fees", color: "#ef4444" },
  { name: "Other", color: "#94a3b8" },
] as const;

/** Public URL for a logo stored at `ws/<workspaceId>/logo/<file>` (served by routes/assets.ts). */
export function logoUrlFromKey(key: string | null): string | null {
  if (!key) return null;
  const match = /^ws\/([\w-]+)\/logo\/([\w-]+\.(?:png|jpg|webp))$/.exec(key);
  return match ? `/api/assets/logo/${match[1]}/${match[2]}` : null;
}

export function toWorkspaceDTO(ws: WorkspaceRow): WorkspaceDTO {
  return {
    id: ws.id,
    name: ws.name,
    logoUrl: logoUrlFromKey(ws.logoKey),
    currency: ws.currency,
    gstNumber: ws.gstNumber,
    address: ws.address,
    phone: ws.phone,
    invoicePrefix: ws.invoicePrefix,
    invoiceNextNumber: ws.invoiceNextNumber,
    brandColor: ws.brandColor,
    defaultTaxMode: ws.defaultTaxMode,
    defaultTaxRate: ws.defaultTaxRate,
    onboarded: ws.onboardedAt !== null,
    createdAt: ws.createdAt.getTime(),
  };
}

export function toMembershipDTO(member: MemberRow): MembershipDTO {
  return { id: member.id, role: member.role, designation: member.designation };
}

export function toSessionUser(user: UserRow): SessionUser {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

interface NewWorkspaceOptions {
  id?: string;
  name: string;
  currency?: CurrencyCode;
  /** What plans are paid in – decided by where the workspace is created (see `billingCurrencyFor`). */
  billingCurrency: BillingCurrency;
}

/**
 * Creates a workspace owned by `user`, with default expense categories, in one transaction
 * (all-or-nothing). Returns the new workspace id.
 */
export async function createWorkspaceForUser(db: Database, user: UserRow, options: NewWorkspaceOptions): Promise<string> {
  const workspaceId = options.id ?? newId();
  const memberId = newId();

  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, name: options.name, currency: options.currency ?? "INR", billingCurrency: options.billingCurrency, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) });
    await tx.insert(workspaceMembers).values({ id: memberId, workspaceId, userId: user.id, role: "owner", designation: "Founder" });
    await tx.insert(expenseCategories).values(DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ ...category, workspaceId })));
    await tx.insert(activityLog).values({
      workspaceId,
      type: "workspace.created",
      actorMemberId: memberId,
      actorName: user.name,
      entityType: "workspace",
      entityId: workspaceId,
      summary: `${user.name} created the workspace`,
    });
  });
  return workspaceId;
}

/** "Priya Sharma" → "Priya's Agency" – a friendly placeholder until onboarding sets the real name. */
export function defaultWorkspaceName(userName: string): string {
  const first = userName.trim().split(/\s+/)[0] || "My";
  return `${first}'s Agency`;
}
