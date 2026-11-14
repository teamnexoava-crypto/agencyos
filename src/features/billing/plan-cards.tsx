import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { TIER_LIST, formatPlanPrice, type BillingCycle, type Tier } from "@shared/plans";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";

const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly", badge: <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">2 months free</span> },
] as const;

export function CycleSwitch({ value, onChange, className }: { value: BillingCycle; onChange: (cycle: BillingCycle) => void; className?: string }) {
  return <SegmentedControl options={CYCLES} value={value} onChange={onChange} label="Billing period" className={className} />;
}

interface PlanCardsProps {
  cycle: BillingCycle;
  /** The button under the price – it differs between the public page and the app, and per tier. */
  action: (tier: Tier) => ReactNode;
  /** Small label shown on a card, e.g. "Your plan". */
  badge?: (tier: Tier) => string | null;
  /** Fade each card in as it scrolls into view (public page). */
  reveal?: boolean;
  className?: string;
}

/** Free, Growth and Premium side by side. Prices, limits and features come from shared/plans.ts. */
export function PlanCards({ cycle, action, badge, reveal = false, className }: PlanCardsProps) {
  return (
    <ul className={cn("grid gap-x-4 gap-y-8 md:grid-cols-3", className)} aria-label="Plans">
      {TIER_LIST.map((tier, index) => {
        const yearly = cycle === "yearly";
        const label = badge?.(tier) ?? (tier.popular ? "Most popular" : null);
        return (
          <motion.li
            key={tier.id}
            initial={reveal ? { opacity: 0, y: 20 } : false}
            whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.06 }}
            className={cn("relative flex flex-col rounded-2xl border bg-card p-6", tier.popular ? "border-2 border-primary shadow-lift" : "shadow-soft")}
          >
            {label && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary-foreground shadow-soft">{label}</span>}
            <h3 className="font-semibold tracking-tight">{tier.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>

            <div className="mt-4 h-[4.25rem]">
              {tier.price === null ? (
                <>
                  <p className="flex items-baseline gap-1.5">
                    <span className="tabular text-4xl font-semibold tracking-tight">₹0</span>
                    <span className="text-sm text-muted-foreground">forever</span>
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">No card needed</p>
                </>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={cycle} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                    <p className="flex items-baseline gap-1.5">
                      <span className="tabular text-4xl font-semibold tracking-tight">{formatPlanPrice(tier.price[cycle])}</span>
                      <span className="text-sm text-muted-foreground">{yearly ? "per year" : "per month"}</span>
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {yearly ? (
                        <>
                          <span className="tabular line-through">{formatPlanPrice(tier.price.monthly * 12)}</span>{" "}
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">Save {formatPlanPrice(tier.price.monthly * 12 - tier.price.yearly)}</span>
                        </>
                      ) : (
                        <>
                          or <span className="tabular">{formatPlanPrice(tier.price.yearly)}</span> a year
                        </>
                      )}
                    </p>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            <div className="mt-5 [&>*]:w-full">{action(tier)}</div>

            {tier.includes && <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{tier.includes}</p>}
            <ul className={cn("space-y-2.5 text-sm", tier.includes ? "mt-3" : "mt-6")}>
              {tier.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
              {tier.missing?.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-muted-foreground">
                  <X className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden="true" />
                  <span>
                    <span className="sr-only">Not included: </span>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </motion.li>
        );
      })}
    </ul>
  );
}
