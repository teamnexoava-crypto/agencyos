/**
 * Plans: what each one costs, allows and unlocks. The landing page, the in-app billing screen and the
 * server-side limits all read from here, so a price, limit or feature is changed in exactly one place.
 *
 * How it works for a workspace:
 *  - it starts with a free trial of the top plan (`TRIAL_PLAN`) for `TRIAL_DAYS` days;
 *  - after that – and whenever a paid plan runs out – it is on the Free tier, with no lock and no
 *    data lost: some things are limited and some features are switched off until it upgrades;
 *  - Growth and Premium are paid (monthly by auto-pay, or a single payment for a month or a year).
 */

/** Every new workspace gets the top plan free for this many days. */
export const TRIAL_DAYS = 7;

/** The plans that are paid for. */
export const PLAN_IDS = ["growth", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Everything a workspace can be on, including the Free tier. */
export const TIER_IDS = ["free", ...PLAN_IDS] as const;
export type TierId = (typeof TIER_IDS)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** How much of each thing a tier allows. `null` means "no limit". */
export interface PlanLimits {
  /** People in the workspace, counting the owner and invitations that are still open. */
  members: number | null;
  /** Projects that are not completed or cancelled. */
  activeProjects: number | null;
  clients: number | null;
  /** Invoices created in a calendar month. */
  invoicesPerMonth: number | null;
  /** Contracts created in a calendar month. */
  contractsPerMonth: number | null;
  /** Leads in the CRM. */
  leads: number | null;
  /** Google Sheets connected to the CRM (0 = the feature is off). */
  sheets: number | null;
  /** Total size of uploaded files, in bytes. */
  storageBytes: number | null;
}

/** Whole features a tier switches on or off. */
export interface PlanFeatures {
  /** Contracts with e-signatures. */
  contracts: boolean;
  /** The client portal link on each project. */
  portal: boolean;
  /** Expenses and the profit & loss report. */
  finance: boolean;
}
export type PlanFeature = keyof PlanFeatures;

export const FEATURE_NAMES: Record<PlanFeature, string> = {
  contracts: "Contracts with e-signatures",
  portal: "The client portal",
  finance: "Expenses and profit & loss",
};

export interface Tier {
  id: TierId;
  name: string;
  tagline: string;
  /** Price in paise; `null` for the Free tier. A year costs ten months. */
  price: Record<BillingCycle, number> | null;
  limits: PlanLimits;
  features: PlanFeatures;
  popular?: boolean;
  /** Shown above the highlights, e.g. "Everything in Free, plus". */
  includes?: string;
  highlights: string[];
  /** What this tier does not have (shown struck through on the Free card). */
  missing?: string[];
}

/** A tier that is paid for. */
export type Plan = Tier & { id: PlanId; price: Record<BillingCycle, number> };

const MB = 1024 ** 2;
const GB = 1024 ** 3;

export const TIERS: { free: Tier; growth: Plan; premium: Plan } = {
  free: {
    id: "free",
    name: "Free",
    tagline: "For trying things out and very small work.",
    price: null,
    limits: { members: 1, activeProjects: 3, clients: 10, invoicesPerMonth: 5, contractsPerMonth: 0, leads: 25, sheets: 0, storageBytes: 200 * MB },
    features: { contracts: false, portal: false, finance: false },
    highlights: ["1 user", "3 active projects with tasks and milestones", "10 clients", "5 invoices a month, with payment tracking", "CRM for 25 leads", "200 MB file storage"],
    missing: ["Team members", "Contracts with e-sign", "Client portal", "Expenses and profit & loss", "Google Sheet sync"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "For freelancers and small agencies getting busy.",
    price: { monthly: 999_00, yearly: 9_990_00 },
    limits: { members: 5, activeProjects: null, clients: null, invoicesPerMonth: null, contractsPerMonth: 15, leads: null, sheets: 2, storageBytes: 10 * GB },
    features: { contracts: true, portal: true, finance: true },
    popular: true,
    includes: "Everything in Free, plus",
    highlights: ["Up to 5 team members", "Unlimited projects, clients and invoices", "15 contracts with e-sign a month", "Client portal for every project", "Expenses and profit & loss", "Unlimited leads, 2 Google Sheet syncs", "10 GB file storage"],
  },
  premium: {
    id: "premium",
    name: "Premium",
    tagline: "For agencies that want no limits.",
    price: { monthly: 1_999_00, yearly: 19_990_00 },
    limits: { members: null, activeProjects: null, clients: null, invoicesPerMonth: null, contractsPerMonth: null, leads: null, sheets: null, storageBytes: 100 * GB },
    features: { contracts: true, portal: true, finance: true },
    includes: "Everything in Growth, with no limits",
    highlights: ["Unlimited team members", "Unlimited contracts with e-sign", "Unlimited Google Sheet syncs", "100 GB file storage", "Priority support on WhatsApp"],
  },
};

export const TIER_LIST: Tier[] = TIER_IDS.map((id) => TIERS[id]);

/** The paid plans, by id. */
export const PLANS: Record<PlanId, Plan> = { growth: TIERS.growth, premium: TIERS.premium };
export const PLAN_LIST: Plan[] = PLAN_IDS.map((id) => PLANS[id]);

/** What a workspace gets during its free trial: everything. */
export const TRIAL_PLAN: PlanId = "premium";

export const NO_LIMITS: PlanLimits = { members: null, activeProjects: null, clients: null, invoicesPerMonth: null, contractsPerMonth: null, leads: null, sheets: null, storageBytes: null };
export const ALL_FEATURES: PlanFeatures = { contracts: true, portal: true, finance: true };

/**
 * Where a workspace stands:
 *  - `open`    payments are not switched on yet, so nothing is limited
 *  - `exempt`  a workspace that is never charged or limited
 *  - `trial`   inside the free trial of the top plan
 *  - `active`  on a paid plan
 *  - `free`    on the Free tier (the trial is over, or a paid plan has run out)
 */
export const BILLING_STATUSES = ["open", "exempt", "trial", "active", "free"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_PAYMENT_STATUSES = ["created", "paid", "failed", "expired"] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

/**
 * Auto-pay: a monthly plan can be paid by a Razorpay subscription (UPI AutoPay or a card mandate).
 * These are Razorpay's own subscription statuses, stored as they arrive.
 */
export const SUBSCRIPTION_STATUSES = ["created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * What auto-pay means for the person looking at it:
 *  - `on`        the mandate is in place and the next charge will be taken automatically
 *  - `retrying`  the last charge failed and Razorpay is trying again
 *  - `stopped`   charging has stopped (retries ran out, or the payer paused the mandate)
 */
export type AutoPayState = "on" | "retrying" | "stopped";

export function autoPayStateOf(status: SubscriptionStatus | null): AutoPayState | null {
  if (status === "authenticated" || status === "active") return "on";
  if (status === "pending") return "retrying";
  if (status === "halted" || status === "paused") return "stopped";
  return null;
}

/** Statuses after which a subscription can never charge again. */
export const isSubscriptionOver = (status: SubscriptionStatus): boolean => status === "cancelled" || status === "completed" || status === "expired";

/**
 * A charge is collected on the day the paid period ends and can take a while to arrive (and Razorpay
 * retries a failed one for a few days), so access continues this long past the paid date while
 * auto-pay is on or retrying.
 */
export const AUTOPAY_GRACE_DAYS = 3;

/** Billing cycles a subscription is set up for (5 years of months). After that it is set up again. */
export const AUTOPAY_TOTAL_CYCLES = 60;

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
 *  - Renewing the same plan starts exactly where the time already paid for ends.
 *  - A first purchase during the trial starts when the trial ends, so no trial days are lost.
 *  - Switching plans converts the unused paid time at the old price into whole days at the new
 *    price. Trial days are never converted: they are free on any plan.
 */
export function nextPaidPeriod(
  current: { plan: PlanId | null; paidUntil: Date | null; trialEndsAt: Date },
  purchase: { plan: PlanId; cycle: BillingCycle },
  now: Date,
): { start: Date; end: Date } {
  // Nothing can be bought for a moment that is still covered by the trial.
  const free = current.trialEndsAt > now ? current.trialEndsAt : now;
  let start = free;
  if (current.plan && current.paidUntil && current.paidUntil > free) {
    if (current.plan === purchase.plan) {
      start = current.paidUntil;
    } else {
      const ratio = PLANS[current.plan].price.monthly / PLANS[purchase.plan].price.monthly;
      start = new Date(free.getTime() + Math.floor(((current.paidUntil.getTime() - free.getTime()) * ratio) / DAY_MS) * DAY_MS);
    }
  }
  return { start, end: addMonths(start, purchase.cycle === "yearly" ? 12 : 1) };
}

/** How long one payment of `amount` paise lasts on a plan, in milliseconds (a month at the plan's own price). */
export function paidTimeFor(amount: number, plan: PlanId): number {
  return Math.floor((30 * amount) / PLANS[plan].price.monthly) * DAY_MS;
}
