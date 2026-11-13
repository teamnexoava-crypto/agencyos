import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus } from "lucide-react";
import { Link } from "react-router";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COMPARE, PLANS, type BillingCycle, type Plan } from "./plans";

const rupees = (amount: number) => `₹${new Intl.NumberFormat("en-IN").format(amount)}`;

const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly", badge: <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">2 months free</span> },
] as const;

function PlanCard({ plan, cycle, signedIn, index }: { plan: Plan; cycle: BillingCycle; signedIn: boolean; index: number }) {
  const free = plan.monthly === 0;
  const yearly = cycle === "yearly" && !free;
  const price = yearly ? plan.yearly : plan.monthly;
  const saving = plan.monthly * 12 - plan.yearly;

  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.06 }}
      className={cn("relative flex flex-col rounded-2xl border bg-card p-6", plan.popular ? "border-2 border-primary shadow-lift" : "shadow-soft")}
    >
      {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground shadow-soft">Most popular</span>}
      <h3 className="font-semibold tracking-tight">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-4 h-[4.25rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={yearly ? "yearly" : "monthly"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            <p className="flex items-baseline gap-1.5">
              <span className="tabular text-4xl font-semibold tracking-tight">{rupees(price)}</span>
              <span className="text-sm text-muted-foreground">{free ? "forever" : yearly ? "per year" : "per month"}</span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {free ? (
                "No card needed"
              ) : yearly ? (
                <>
                  <span className="tabular line-through">{rupees(plan.monthly * 12)}</span> <span className="font-medium text-emerald-700 dark:text-emerald-400">Save {rupees(saving)}</span>
                </>
              ) : (
                <>
                  or <span className="tabular">{rupees(plan.yearly)}</span> a year
                </>
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <Button asChild variant={plan.popular ? "default" : "outline"} className="mt-5 w-full">
        {signedIn ? <Link to="/app">{free ? "Open dashboard" : `Choose ${plan.name}`}</Link> : <a href="/api/auth/google">{free ? "Start free" : "Start 14-day free trial"}</a>}
      </Button>

      {plan.includes && <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{plan.includes}</p>}
      <ul className={cn("space-y-2.5 text-sm", plan.includes ? "mt-3" : "mt-6")}>
        {plan.highlights.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
          </li>
        ))}
      </ul>
    </motion.li>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto size-4 text-primary" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not included" />;
  return <span className="tabular">{value}</span>;
}

/** Plan cards with a monthly / yearly switch, and the full feature comparison underneath. */
export function Pricing({ signedIn }: { signedIn: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="mt-10">
      <SegmentedControl options={CYCLES} value={cycle} onChange={setCycle} label="Billing period" className="mx-auto" />

      <ul className="mt-10 grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
        {PLANS.map((plan, index) => (
          <PlanCard key={plan.id} plan={plan} cycle={cycle} signedIn={signedIn} index={index} />
        ))}
      </ul>
      <p className="mt-6 text-center text-[13px] text-muted-foreground">Every paid plan starts with a 14-day free trial. No card needed · Pay by UPI, card or netbanking · Cancel anytime.</p>

      <div className="mt-16">
        <h3 className="text-center text-xl font-semibold tracking-tight">Compare plans</h3>
        <div className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-soft">
          <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="w-[30%] px-3 py-4 text-left font-medium text-muted-foreground sm:w-[32%] sm:px-5">
                  Features
                </th>
                {PLANS.map((plan) => (
                  <th key={plan.id} scope="col" className={cn("px-1 py-4 text-center font-semibold sm:px-3", plan.popular && "bg-primary/5 text-primary")}>
                    {plan.name}
                    <span className="tabular block text-[11px] font-normal text-muted-foreground sm:text-xs">{plan.monthly === 0 ? "₹0" : `${rupees(cycle === "yearly" ? plan.yearly : plan.monthly)}/${cycle === "yearly" ? "yr" : "mo"}`}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARE.map((section) => (
              <tbody key={section.group}>
                <tr className="border-b bg-muted/40">
                  <th scope="colgroup" colSpan={5} className="px-3 py-2 text-left sm:px-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {section.group}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-3 text-left font-normal sm:px-5">
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={PLANS[index]?.id ?? index} className={cn("px-1 py-3 text-center sm:px-3", PLANS[index]?.popular && "bg-primary/5")}>
                        <Cell value={value} />
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
