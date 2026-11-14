import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Link } from "react-router";
import { TIER_LIST, TRIAL_DAYS, formatPlanPrice, type BillingCycle, type Tier } from "@shared/plans";
import { GoogleIcon } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { CycleSwitch, PlanCards } from "@/features/billing/plan-cards";
import { cn } from "@/lib/utils";

type Cell = string | boolean;

const amount = (value: number | null, unit = "") => (value === null ? "Unlimited" : value === 0 ? false : `${value}${unit}`);
const size = (bytes: number | null) => (bytes === null ? "Unlimited" : bytes >= 1024 ** 3 ? `${Math.round(bytes / 1024 ** 3)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);
const perTier = (pick: (tier: Tier) => Cell): Cell[] => TIER_LIST.map(pick);

/** The full comparison. Every value is read from the plans themselves, so it can't drift from what is enforced. */
const COMPARE: { group: string; rows: { label: string; values: Cell[] }[] }[] = [
  {
    group: "Work",
    rows: [
      { label: "Team members", values: perTier(({ limits }) => (limits.members === null ? "Unlimited" : limits.members === 1 ? "Just you" : `Up to ${limits.members}`)) },
      { label: "Active projects", values: perTier(({ limits }) => amount(limits.activeProjects)) },
      { label: "Tasks, milestones and kanban board", values: perTier(() => true) },
      { label: "Clients", values: perTier(({ limits }) => amount(limits.clients)) },
    ],
  },
  {
    group: "Money",
    rows: [
      { label: "Invoices (GST-ready, payment tracking)", values: perTier(({ limits }) => amount(limits.invoicesPerMonth, " a month")) },
      { label: "Expenses and profit & loss", values: perTier(({ features }) => features.finance) },
    ],
  },
  {
    group: "Contracts and clients",
    rows: [
      { label: "Contracts with e-signatures", values: perTier(({ features, limits }) => features.contracts && amount(limits.contractsPerMonth, " a month")) },
      { label: "Client portal for every project", values: perTier(({ features }) => features.portal) },
    ],
  },
  {
    group: "CRM",
    rows: [
      { label: "Leads and follow-ups", values: perTier(({ limits }) => amount(limits.leads)) },
      { label: "Google Sheet sync", values: perTier(({ limits }) => (limits.sheets === null ? "Unlimited" : limits.sheets === 0 ? false : `${limits.sheets} sheet${limits.sheets === 1 ? "" : "s"}`)) },
    ],
  },
  {
    group: "Storage and support",
    rows: [
      { label: "File storage", values: perTier(({ limits }) => size(limits.storageBytes)) },
      { label: "Support", values: perTier(({ id }) => (id === "premium" ? "Priority, WhatsApp" : id === "growth" ? "Email" : "Self-serve")) },
    ],
  },
];

/** Public pricing: Free, Growth and Premium with a monthly / yearly switch, and the full comparison underneath. */
export function Pricing({ signedIn }: { signedIn: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="mt-10">
      <CycleSwitch value={cycle} onChange={setCycle} className="mx-auto" />

      <PlanCards
        cycle={cycle}
        reveal
        className="mx-auto mt-10 max-w-5xl"
        action={(tier) => (
          <Button asChild variant={tier.popular ? "default" : "outline"}>
            {signedIn ? (
              <Link to={tier.price === null ? "/app" : "/app/billing"}>{tier.price === null ? "Open dashboard" : `Choose ${tier.name}`}</Link>
            ) : (
              <a href="/api/auth/google">
                {!tier.popular && <GoogleIcon />} {tier.price === null ? "Start free" : `Try ${tier.name} free`}
              </a>
            )}
          </Button>
        )}
      />
      <p className="mx-auto mt-6 max-w-3xl text-center text-[13px] text-balance text-muted-foreground">
        Every new account gets {TRIAL_DAYS} days of Premium, with no card needed. After that you stay on Free for as long as you like, or pick a plan. Monthly plans renew by UPI AutoPay or card – turn it
        off any time. Yearly plans are one payment.
      </p>

      <div className="mx-auto mt-16 max-w-5xl">
        <h3 className="text-center text-xl font-semibold tracking-tight">Compare plans</h3>
        <div className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-soft">
          <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="w-[34%] px-3 py-4 text-left font-medium text-muted-foreground sm:px-5">
                  Features
                </th>
                {TIER_LIST.map((tier) => (
                  <th key={tier.id} scope="col" className={cn("px-1 py-4 text-center font-semibold sm:px-3", tier.popular && "bg-primary/5 text-primary")}>
                    {tier.name}
                    <span className="tabular block text-[11px] font-normal text-muted-foreground sm:text-xs">{tier.price === null ? "₹0" : `${formatPlanPrice(tier.price[cycle])}/${cycle === "yearly" ? "yr" : "mo"}`}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARE.map((section) => (
              <tbody key={section.group}>
                <tr className="border-b bg-muted/40">
                  <th scope="colgroup" colSpan={TIER_LIST.length + 1} className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-5">
                    {section.group}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-3 text-left font-normal sm:px-5">
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={TIER_LIST[index]?.id ?? index} className={cn("px-1 py-3 text-center sm:px-3", TIER_LIST[index]?.popular && "bg-primary/5")}>
                        {value === true ? (
                          <Check className="mx-auto size-4 text-primary" aria-label="Included" />
                        ) : value === false ? (
                          <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />
                        ) : (
                          <span className="tabular">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}
