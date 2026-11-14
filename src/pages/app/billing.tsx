import { useState } from "react";
import { BadgeCheck, Clock, Gift, LoaderCircle, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AUTOPAY_GRACE_DAYS, PLANS, TRIAL_DAYS, formatPlanPrice } from "@shared/plans";
import type { AutoPayDTO, BillingDTO, BillingOverview, BillingPaymentDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBilling, useBillingOverview, useCancelAutoPay } from "@/features/billing/api";
import { PlanChooser } from "@/features/billing/plan-chooser";
import { usePaymentResult } from "@/features/billing/use-payment-result";
import { errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const formatDay = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
const daysLeft = (count: number | null) => (count === null ? "" : count <= 1 ? "Last day" : `${count} days left`);

function StatusCard({ billing, autoPay }: { billing: BillingDTO; autoPay: AutoPayDTO | null }) {
  const [confirmOff, setConfirmOff] = useState(false);
  const cancel = useCancelAutoPay();
  // The session knows whether auto-pay is on; the amount and date arrive with the overview a moment later.
  const mandate = autoPay?.state ?? billing.autoPay;
  const mandatePlan = autoPay ? PLANS[autoPay.plan].name : "";
  const planName = billing.plan ? PLANS[billing.plan].name : mandatePlan;
  const paidUntil = billing.paidUntil ? formatDay(billing.paidUntil) : formatDay(billing.trialEndsAt);
  const price = autoPay ? formatPlanPrice(autoPay.amount) : "The payment";
  const lockDay = formatDay((billing.paidUntil ?? billing.trialEndsAt) + AUTOPAY_GRACE_DAYS * 86_400_000);
  const retrying = `We couldn't collect ${autoPay ? price : "the payment"}. Razorpay is trying again – look for its message, or a request in your UPI app, and approve it. If it keeps failing the workspace is locked on ${lockDay}; you can also pay for a month below.`;

  const trial = (): { text: string; tag: string | null; warn?: boolean } => {
    const until = formatDay(billing.trialEndsAt);
    if (mandate === "on") {
      return { text: `Your free trial runs until ${until}. Auto-pay is set up: ${autoPay ? `${price} for the ${mandatePlan} plan` : "your plan's price"} is taken that day and every month after – nothing before then.`, tag: autoPay ? `${mandatePlan} plan chosen` : "Plan chosen" };
    }
    if (mandate === "retrying") return { text: `Your free trial has ended. ${retrying}`, tag: "Payment failed", warn: true };
    return {
      text: `Your trial runs until ${until}, with everything in the Team plan. Choose a plan any time – billing only starts when the trial ends, so you lose nothing by choosing early.`,
      tag: daysLeft(billing.daysLeft),
    };
  };

  const active = (): { text: string; tag: string | null; warn?: boolean } => {
    if (mandate === "on") {
      return { text: autoPay ? `Auto-pay is on: ${price} is taken on ${formatDay(autoPay.nextChargeAt ?? billing.paidUntil ?? 0)}, and every month after that, until you turn it off.` : "Auto-pay is on, until you turn it off.", tag: "Active" };
    }
    if (mandate === "retrying") return { text: retrying, tag: "Payment failed", warn: true };
    if (mandate === "stopped") {
      return { text: `Auto-pay has stopped – the payment kept failing, or the mandate was paused. Your plan runs until ${paidUntil}. Turn auto-pay on again below, or pay for a month.`, tag: daysLeft(billing.daysLeft), warn: true };
    }
    return { text: `Paid until ${paidUntil}. Auto-pay is off, so nothing is taken by itself – turn it on below, or pay again before that date.`, tag: daysLeft(billing.daysLeft) };
  };

  const view: { icon: LucideIcon; title: string; text: string; tag: string | null; warn?: boolean } = {
    open: { icon: Sparkles, title: "Everything is unlocked", text: `Online payments are being set up. Once they open, every workspace gets a ${TRIAL_DAYS}-day free trial and you can choose a plan here.`, tag: null },
    exempt: { icon: Gift, title: "This workspace is free", text: "It has full access with no limits and never needs a plan.", tag: null },
    trial: { icon: Clock, title: "Free trial", ...trial() },
    active: { icon: BadgeCheck, title: `${planName} plan`, ...active() },
    expired: { icon: Clock, title: "No active plan", text: "Choose a plan below to unlock the workspace.", tag: null },
  }[billing.status];

  return (
    <section className={cn("flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-soft", view.warn && "border-amber-500/50")} aria-label="Current plan">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", view.warn ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary")}>
        <view.icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight">{view.title}</h2>
          {view.tag && <Badge variant="secondary">{view.tag}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{view.text}</p>
        {mandate && (
          <Button variant="outline" size="sm" className="mt-3" disabled={cancel.isPending} onClick={() => setConfirmOff(true)}>
            {cancel.isPending && <LoaderCircle className="animate-spin" />} Turn off auto-pay
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn off auto-pay?"
        description={`No more payments will be taken. ${billing.status === "trial" ? "Your free trial" : `Your ${planName} plan`} runs until ${paidUntil}; after that the workspace is locked until you pay again.`}
        confirmLabel="Turn off auto-pay"
        onConfirm={() => {
          setConfirmOff(false);
          cancel.mutate(undefined, { onSuccess: () => toast.success("Auto-pay is off. Nothing more will be taken."), onError: (error) => toast.error(errorMessage(error, "Could not turn off auto-pay.")) });
        }}
      />
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
      {limit !== null && <Progress value={(used / limit) * 100} label={`${label} used`} full="limit" className="mt-3" />}
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
                  {PLANS[payment.plan].name} · {payment.cycle === "yearly" ? "1 year" : payment.autoPay ? "Auto-pay" : "1 month"}
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
        <StatusCard billing={billing} autoPay={overview?.autoPay ?? null} />

        {/* The plans come straight after the summary: choosing one is what this page is mostly for. */}
        {billing.status !== "exempt" && (
          <section aria-labelledby="plans-heading">
            <PlanChooser billing={sessionBilling} heading={billing.status === "active" || billing.autoPay ? "Plans" : "Choose a plan"} />
          </section>
        )}

        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-24 rounded-2xl" role="status" aria-label="Loading usage" />
        ) : (
          limited && <Usage overview={overview} />
        )}

        {overview && <Payments payments={overview.payments} />}
      </div>
    </>
  );
}
