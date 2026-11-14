import { BadgeCheck, Clock, Gift, Sparkles } from "lucide-react";
import { PLANS, TRIAL_DAYS, formatPlanPrice } from "@shared/plans";
import type { BillingDTO, BillingOverview, BillingPaymentDTO } from "@shared/types";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBilling, useBillingOverview } from "@/features/billing/api";
import { PlanChooser } from "@/features/billing/plan-chooser";
import { usePaymentResult } from "@/features/billing/use-payment-result";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const formatDay = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
const daysLeft = (count: number | null) => (count === null ? "" : count <= 1 ? "Last day" : `${count} days left`);

function StatusCard({ billing }: { billing: BillingDTO }) {
  const view = {
    open: { icon: Sparkles, title: "Everything is unlocked", text: `Online payments are being set up. Once they open, every workspace gets a ${TRIAL_DAYS}-day free trial and you can choose a plan here.`, tag: null },
    exempt: { icon: Gift, title: "This workspace is free", text: "It has full access with no limits and never needs a plan.", tag: null },
    trial: {
      icon: Clock,
      title: "Free trial",
      text: `Your trial runs until ${formatDay(billing.trialEndsAt)}, with everything in the Team plan. Choose a plan any time – the days left in your trial are added on, so you lose nothing by paying early.`,
      tag: daysLeft(billing.daysLeft),
    },
    active: {
      icon: BadgeCheck,
      title: `${billing.plan ? PLANS[billing.plan].name : ""} plan`,
      text: billing.paidUntil ? `Paid until ${formatDay(billing.paidUntil)}. Extend it any time – the new period starts when this one ends.` : "",
      tag: daysLeft(billing.daysLeft),
    },
    expired: { icon: Clock, title: "No active plan", text: "Choose a plan below to unlock the workspace.", tag: null },
  }[billing.status];

  return (
    <section className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-soft" aria-label="Current plan">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <view.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">{view.title}</h2>
          {view.tag && <Badge variant="secondary">{view.tag}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{view.text}</p>
      </div>
    </section>
  );
}

function Meter({ label, used, limit, format = String }: { label: string; used: number; limit: number | null; format?: (value: number) => string }) {
  const full = limit !== null && used >= limit;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-lg font-semibold tracking-tight", full && "text-amber-700 dark:text-amber-400")}>
        {format(used)} <span className="text-sm font-normal text-muted-foreground">{limit === null ? "· no limit" : `of ${format(limit)}`}</span>
      </p>
      {limit !== null && <Progress value={(used / limit) * 100} label={`${label} used`} className="mt-3" />}
    </div>
  );
}

function Usage({ overview }: { overview: BillingOverview }) {
  const { usage, billing } = overview;
  return (
    <section aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="mb-3 text-sm font-semibold">
        What you're using
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Meter label="People (with open invites)" used={usage.members} limit={billing.limits.members} />
        <Meter label="Google Sheets connected" used={usage.sheets} limit={billing.limits.sheets} />
        <Meter label="Contracts this month" used={usage.contractsThisMonth} limit={billing.limits.contractsPerMonth} />
        <Meter label="File storage" used={usage.storageBytes} limit={billing.limits.storageBytes} format={formatBytes} />
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<BillingPaymentDTO["status"], string> = { created: "Not completed", paid: "Paid", failed: "Failed", expired: "Not completed" };

function Payments({ payments }: { payments: BillingPaymentDTO[] }) {
  if (payments.length === 0) return null;
  return (
    <section aria-labelledby="payments-heading">
      <h2 id="payments-heading" className="mb-3 text-sm font-semibold">
        Payments
      </h2>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left text-[13px] text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">
                Date
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Plan
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Covers
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="tabular px-5 py-3 whitespace-nowrap">{formatDay(payment.paidAt ?? payment.createdAt)}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {PLANS[payment.plan].name} · {payment.cycle === "yearly" ? "Yearly" : "Monthly"}
                </td>
                <td className="tabular px-3 py-3 whitespace-nowrap text-muted-foreground">{payment.periodStart && payment.periodEnd ? `${formatDay(payment.periodStart)} – ${formatDay(payment.periodEnd)}` : "—"}</td>
                <td className="tabular px-3 py-3 text-right whitespace-nowrap">{formatPlanPrice(payment.amount)}</td>
                <td className="px-5 py-3 text-right">
                  <Badge variant={payment.status === "paid" ? "default" : "secondary"}>{STATUS_LABEL[payment.status]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Owner/admin screen for the workspace's own subscription: plan, usage, paying and past payments. */
export default function BillingPage() {
  const sessionBilling = useBilling();
  const { data: overview, isPending, isError, refetch } = useBillingOverview();
  usePaymentResult();
  // The overview is fresher after a payment; the session copy covers the first paint.
  const billing = overview?.billing ?? sessionBilling;
  const limited = billing.status === "trial" || billing.status === "active";

  return (
    <>
      <PageHeader title="Billing" description="Your plan, what you're using, and your payments." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <StatusCard billing={billing} />

        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-24 rounded-2xl" role="status" aria-label="Loading usage" />
        ) : (
          limited && <Usage overview={overview} />
        )}

        {billing.status !== "exempt" && (
          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" className="mb-5 text-center text-xl font-semibold tracking-tight">
              {billing.status === "active" ? "Extend or change your plan" : "Choose a plan"}
            </h2>
            <PlanChooser billing={billing} />
          </section>
        )}

        {overview && <Payments payments={overview.payments} />}
      </div>
    </>
  );
}
