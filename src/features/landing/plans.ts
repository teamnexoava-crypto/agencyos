export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  id: "free" | "solo" | "team" | "agency";
  name: string;
  tagline: string;
  /** Rupees per month; a year costs ten months. */
  monthly: number;
  yearly: number;
  popular?: boolean;
  /** Shown above the list on paid plans, e.g. "Everything in Free, plus". */
  includes?: string;
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try it with real client work.",
    monthly: 0,
    yearly: 0,
    highlights: ["1 user", "3 active projects", "5 invoices a month", "2 contracts with e-sign a month", "Client portal with GrowUpliftOS badge", "CRM for up to 50 leads"],
  },
  {
    id: "solo",
    name: "Solo",
    tagline: "For freelancers and consultants.",
    monthly: 499,
    yearly: 4990,
    includes: "Everything in Free, plus",
    highlights: ["Unlimited projects and invoices", "10 contracts with e-sign a month", "Your own branding on client pages", "Unlimited CRM leads", "1 Google Sheet sync", "2 GB file storage"],
  },
  {
    id: "team",
    name: "Team",
    tagline: "For small agencies that work together.",
    monthly: 999,
    yearly: 9990,
    popular: true,
    includes: "Everything in Solo, plus",
    highlights: ["Up to 5 team members", "Unlimited contracts with e-sign", "5 Google Sheet syncs", "10 GB file storage", "Priority support"],
  },
  {
    id: "agency",
    name: "Agency",
    tagline: "For bigger teams with many clients.",
    monthly: 1999,
    yearly: 19990,
    includes: "Everything in Team, plus",
    highlights: ["Up to 15 team members", "Unlimited Google Sheet syncs", "50 GB file storage", "Priority and WhatsApp support", "Extra members at ₹149 each"],
  },
];

/** One row of the full comparison; `true` renders as a tick and `false` as a dash. */
export interface CompareRow {
  label: string;
  values: [string | boolean, string | boolean, string | boolean, string | boolean];
}

export const COMPARE: { group: string; rows: CompareRow[] }[] = [
  {
    group: "Work",
    rows: [
      { label: "Team members", values: ["1", "1", "Up to 5", "Up to 15"] },
      { label: "Active projects", values: ["3", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Clients", values: ["Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Tasks, milestones and kanban board", values: [true, true, true, true] },
    ],
  },
  {
    group: "Money",
    rows: [
      { label: "Invoices", values: ["5 a month", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Payments and expenses", values: [true, true, true, true] },
      { label: "Profit and loss reports", values: ["Basic", true, true, true] },
    ],
  },
  {
    group: "Contracts and clients",
    rows: [
      { label: "Contracts with e-signatures", values: ["2 a month", "10 a month", "Unlimited", "Unlimited"] },
      { label: "Client portal link", values: [true, true, true, true] },
      { label: "Your own branding on client pages", values: [false, true, true, true] },
    ],
  },
  {
    group: "CRM",
    rows: [
      { label: "Leads", values: ["50", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Google Sheet sync", values: [false, "1 sheet", "5 sheets", "Unlimited"] },
    ],
  },
  {
    group: "Storage and support",
    rows: [
      { label: "File storage", values: ["100 MB", "2 GB", "10 GB", "50 GB"] },
      { label: "Support", values: ["Email", "Email", "Priority", "WhatsApp"] },
    ],
  },
];
