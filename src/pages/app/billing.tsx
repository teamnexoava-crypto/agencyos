import { useState } from "react";
import { toast } from "sonner";
import { AUTOPAY_GRACE_DAYS, PLANS, formatPlanPrice } from "@shared/plans";
import type { AutoPayDTO, BillingDTO, BillingOverview, BillingPaymentDTO } from "@shared/types";
import { formatIndianDate } from "@shared/dates";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBilling, useBillingOverview, useCancelAutoPay } from "@/features/billing/api";
import { PlanChooser } from "@/features/billing/plan-chooser";
import { usePaymentResult } from "@/features/billing/use-payment-result";
import { errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const formatDay = (ms: number) => formatIndianDate(new Date(ms), { day: "numeric", month: "short", year: "numeric" });

/**
 * One quiet line about how the plan is being paid, with the way to turn auto-pay off. It sits at the
 * bottom of the page unless a payment is failing (`warn`), in which case it is shown above the plans –
 * that is something the customer needs to see.
 */
function PlanNote({ billing, autoPay, warnOnly }: { billing: BillingDTO; autoPay: AutoPayDTO | null; warnOnly: boolean }) {
  const [confirmOff, setConfirmOff] = useState(false);
  const cancel = useCancelAutoPay();
  // The session knows whether auto-pay is on; the amount and date arrive with the overview a moment later.
  const mandate = autoPay?.state ?? billing.autoPay;
  if (billing.status !== "active" && !mandate) return null;

  const planName = autoPay ? PLANS[autoPay.plan].name : billing.plan ? PLANS[billing.plan].name : "";
  const until = formatDay(billing.paidUntil ?? billing.trialEndsAt);
  const price = autoPay ? formatPlanPrice(autoPay.amount, autoPay.currency) : "the payment";
  const lastDay = formatDay((billing.paidUntil ?? billing.trialEndsAt) + AUTOPAY_GRACE_DAYS * 86_400_000);
  const warn = mandate === "retrying" || mandate === "stopped";
  if (warn !== warnOnly) return null;

  const text =
    mandate === "on"
      ? `Auto-pay is on: ${autoPay ? `${price} for ${planName}` : "your plan"} is taken on ${formatDay(autoPay?.nextChargeAt ?? billing.paidUntil ?? billing.trialEndsAt)}, then every month.`
      : mandate === "retrying"
        ? `We couldn't collect ${price}. ${billing.currency === "INR" ? "Razorpay" : "Dodo Payments"} is trying again – look for its message${billing.currency === "INR" ? ", or a request in your UPI app," : " or one from your bank"} and approve it. If it keeps failing you move to the Free plan on ${lastDay}; you can also pay for a month below.`
        : mandate === "stopped"
          ? `Auto-pay has stopped – the payment kept failing, or the mandate was paused. Your plan runs until ${until}; choose it again below to restart.`
          : `Your ${planName} plan is paid until ${until}. Nothing is taken automatically.`;

  return (
    <section aria-label="How your plan is paid" className={cn("text-[13px]", warn ? "rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-200" : "text-center text-muted-foreground")}>
      <p>
        {text}{" "}
        {mandate && (
          <button type="button" disabled={cancel.isPending} className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50" onClick={() => setConfirmOff(true)}>
            Manage auto-pay
          </button>
        )}
      </p>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn off auto-pay?"
        description={`No more payments will be taken. You keep ${billing.status === "trial" ? "your trial" : `the ${planName} plan`} until ${until}. After that you move to the Free plan: nothing is deleted, but team members, contracts, the client portal, finance and Google Sheet sync switch off.`}
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
  const full = limit !== null && limit > 0 && used >= limit;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-lg font-semibold tracking-tight", full && "text-amber-700 dark:text-amber-400")}>
        {limit === 0 ? <span className="text-sm font-normal text-muted-foreground">Not in your plan</span> : format(used)}{" "}
        {limit !== 0 && <span className="text-sm font-normal text-muted-foreground">{limit === null ? "· no limit" : `of ${format(limit)}`}</span>}
      </p>
      {limit !== null && limit > 0 && <Progress value={(used / limit) * 100} label={`${label} used`} full="limit" className="mt-3" />}
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
        <Meter label="Active projects" used={usage.activeProjects} limit={billing.limits.activeProjects} />
        <Meter label="Clients" used={usage.clients} limit={billing.limits.clients} />
        <Meter label="Invoices this month" used={usage.invoicesThisMonth} limit={billing.limits.invoicesPerMonth} />
        <Meter label="Leads" used={usage.leads} limit={billing.limits.leads} />
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
                <td className="tabular px-3 py-3 text-right whitespace-nowrap">{formatPlanPrice(payment.amount, payment.currency)}</td>
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
  const limited = billing.status === "trial" || billing.status === "active" || billing.status === "free";

  return (
    <>
      <PageHeader title="Billing" description="Your plan, what you're using, and your payments." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
        <PlanNote billing={billing} autoPay={overview?.autoPay ?? null} warnOnly />
        {/* The plans come straight after the summary: choosing one is what this page is mostly for. */}
        <section aria-labelledby="plans-heading">
          <PlanChooser billing={sessionBilling} heading="Plans" />
        </section>

        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-24 rounded-2xl" role="status" aria-label="Loading usage" />
        ) : (
          limited && <Usage overview={overview} />
        )}

        {overview && <Payments payments={overview.payments} />}
        <PlanNote billing={billing} autoPay={overview?.autoPay ?? null} warnOnly={false} />
      </div>
    </>
  );
}
