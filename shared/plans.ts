/**
 * Subscription plans: what each one costs and allows. The landing page, the in-app billing screen
 * and the server-side limits all read from here, so a price or limit is changed in exactly one place.
 */

/** Every new workspace can use the product for this many days before a plan is needed. */
export const TRIAL_DAYS = 7;

export const PLAN_IDS = ["solo", "team", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** `null` means "no limit". */
export interface PlanLimits {
  /** People in the workspace, counting the owner and invitations that are still open. */
  members: number | null;
  /** Google Sheets connected to the CRM. */
  sheets: number | null;
  /** Contracts created in a calendar month. */
  contractsPerMonth: number | null;
  /** Total size of uploaded files, in bytes. */
  storageBytes: number | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price in paise. A year costs ten months. */
  price: Record<BillingCycle, number>;
  limits: PlanLimits;
  popular?: boolean;
  /** Shown above the highlights, e.g. "Everything in Solo, plus". */
  includes?: string;
  highlights: string[];
}

const GB = 1024 ** 3;

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: "solo",
    name: "Solo",
    tagline: "For freelancers and consultants.",
    price: { monthly: 499_00, yearly: 4_990_00 },
    limits: { members: 1, sheets: 1, contractsPerMonth: 10, storageBytes: 2 * GB },
    highlights: ["1 user", "Unlimited projects, clients and invoices", "10 contracts with e-sign a month", "Client portal for every project", "CRM with 1 Google Sheet sync", "2 GB file storage"],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "For small agencies that work together.",
    price: { monthly: 999_00, yearly: 9_990_00 },
    limits: { members: 5, sheets: 5, contractsPerMonth: null, storageBytes: 10 * GB },
    popular: true,
    includes: "Everything in Solo, plus",
    highlights: ["Up to 5 team members", "Unlimited contracts with e-sign", "5 Google Sheet syncs", "10 GB file storage", "Priority support"],
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "For bigger teams with many clients.",
    price: { monthly: 1_999_00, yearly: 19_990_00 },
    limits: { members: 15, sheets: null, contractsPerMonth: null, storageBytes: 50 * GB },
    includes: "Everything in Team, plus",
    highlights: ["Up to 15 team members", "Unlimited Google Sheet syncs", "50 GB file storage", "Priority and WhatsApp support"],
  },
};

export const PLAN_LIST: Plan[] = PLAN_IDS.map((id) => PLANS[id]);

/** What a workspace gets while it is still on its free trial. */
export const TRIAL_PLAN: PlanId = "team";

export const NO_LIMITS: PlanLimits = { members: null, sheets: null, contractsPerMonth: null, storageBytes: null };

/**
 * Where a workspace stands:
 *  - `open`     payments are not switched on yet, so nothing is limited or locked
 *  - `exempt`   a workspace that is never charged
 *  - `trial`    inside the free trial
 *  - `active`   on a paid plan
 *  - `expired`  the trial or the paid period has ended: the app is locked until a plan is bought
 */
export const BILLING_STATUSES = ["open", "exempt", "trial", "active", "expired"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_PAYMENT_STATUSES = ["created", "paid", "failed", "expired"] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

/** A paid plan nearing its end shows a reminder this many days ahead. */
export const RENEWAL_REMINDER_DAYS = 5;

export const formatPlanPrice = (paise: number) => `₹${new Intl.NumberFormat("en-IN").format(paise / 100)}`;

/** Moves a date forward by whole calendar months (31 Jan + 1 month = 28/29 Feb), in UTC. */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const DAY_MS = 86_400_000;

/**
 * The paid period a payment buys.
 *  - Renewing the same plan adds to the time already paid for.
 *  - A first purchase during the trial starts when the trial ends, so no trial days are lost.
 *  - Switching plans converts the unused time at the old price into extra days at the new price.
 */
export function nextPaidPeriod(
  current: { plan: PlanId | null; paidUntil: Date | null; trialEndsAt: Date },
  purchase: { plan: PlanId; cycle: BillingCycle },
  now: Date,
): { start: Date; end: Date } {
  let start = now;
  const paidLeft = current.plan && current.paidUntil ? current.paidUntil.getTime() - now.getTime() : 0;
  if (current.plan && paidLeft > 0) {
    const ratio = current.plan === purchase.plan ? 1 : PLANS[current.plan].price.monthly / PLANS[purchase.plan].price.monthly;
    start = new Date(now.getTime() + Math.floor((paidLeft * ratio) / DAY_MS) * DAY_MS);
  } else if (!current.plan && current.trialEndsAt.getTime() > now.getTime()) {
    start = current.trialEndsAt;
  }
  return { start, end: addMonths(start, purchase.cycle === "yearly" ? 12 : 1) };
}
