import { useState } from "react";
import { Check } from "lucide-react";
import { Link } from "react-router";
import { PLAN_LIST, TRIAL_DAYS, formatPlanPrice, type BillingCycle, type PlanLimits } from "@shared/plans";
import { GoogleIcon } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { CycleSwitch, PlanCards } from "@/features/billing/plan-cards";
import { cn } from "@/lib/utils";

type Cell = string | true;

const count = (value: number | null, one: string, many: string) => (value === null ? "Unlimited" : value === 1 ? `1 ${one}` : `${value} ${many}`);
const perPlan = (pick: (limits: PlanLimits) => Cell): Cell[] => PLAN_LIST.map((plan) => pick(plan.limits));
const everyPlan = (value: Cell): Cell[] => PLAN_LIST.map(() => value);

/** The full comparison. Anything with a limit is read from the plans themselves, so it can't drift. */
const COMPARE: { group: string; rows: { label: string; values: Cell[] }[] }[] = [
  {
    group: "Work",
    rows: [
      { label: "Team members", values: perPlan((limits) => (limits.members === null ? "Unlimited" : limits.members === 1 ? "1" : `Up to ${limits.members}`)) },
      { label: "Projects, tasks and milestones", values: everyPlan("Unlimited") },
      { label: "Clients", values: everyPlan("Unlimited") },
    ],
  },
  {
    group: "Money",
    rows: [
      { label: "Invoices and payments", values: everyPlan("Unlimited") },
      { label: "Expenses and profit & loss", values: everyPlan(true) },
    ],
  },
  {
    group: "Contracts and clients",
    rows: [
      { label: "Contracts with e-signatures", values: perPlan((limits) => (limits.contractsPerMonth === null ? "Unlimited" : `${limits.contractsPerMonth} a month`)) },
      { label: "Client portal for every project", values: everyPlan(true) },
    ],
  },
  {
    group: "CRM",
    rows: [
      { label: "Leads and follow-ups", values: everyPlan("Unlimited") },
      { label: "Google Sheet sync", values: perPlan((limits) => count(limits.sheets, "sheet", "sheets")) },
    ],
  },
  {
    group: "Storage",
    rows: [{ label: "File storage", values: perPlan((limits) => (limits.storageBytes === null ? "Unlimited" : `${Math.round(limits.storageBytes / 1024 ** 3)} GB`)) }],
  },
];

/** Public pricing: the plans with a monthly / yearly switch, and the full comparison underneath. */
export function Pricing({ signedIn }: { signedIn: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="mt-10">
      <CycleSwitch value={cycle} onChange={setCycle} className="mx-auto" />

      <PlanCards
        cycle={cycle}
        reveal
        className="mx-auto mt-10 max-w-5xl"
        action={(plan) => (
          <Button asChild variant={plan.popular ? "default" : "outline"}>
            {signedIn ? (
              <Link to="/app/billing">Choose {plan.name}</Link>
            ) : (
              <a href="/api/auth/google">
                {!plan.popular && <GoogleIcon />} Start {TRIAL_DAYS}-day free trial
              </a>
            )}
          </Button>
        )}
      />
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Every plan starts with a {TRIAL_DAYS}-day free trial with everything in Team. No card needed · Pay by UPI, card or netbanking · No auto-debit.
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
                {PLAN_LIST.map((plan) => (
                  <th key={plan.id} scope="col" className={cn("px-1 py-4 text-center font-semibold sm:px-3", plan.popular && "bg-primary/5 text-primary")}>
                    {plan.name}
                    <span className="tabular block text-[11px] font-normal text-muted-foreground sm:text-xs">
                      {formatPlanPrice(plan.price[cycle])}/{cycle === "yearly" ? "yr" : "mo"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARE.map((section) => (
              <tbody key={section.group}>
                <tr className="border-b bg-muted/40">
                  <th scope="colgroup" colSpan={PLAN_LIST.length + 1} className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-5">
                    {section.group}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-3 text-left font-normal sm:px-5">
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={PLAN_LIST[index]?.id ?? index} className={cn("px-1 py-3 text-center sm:px-3", PLAN_LIST[index]?.popular && "bg-primary/5")}>
                        {value === true ? <Check className="mx-auto size-4 text-primary" aria-label="Included" /> : <span className="tabular">{value}</span>}
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
