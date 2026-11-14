import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { PLANS, formatPlanPrice, type BillingCycle, type Plan, type PlanId } from "@shared/plans";
import type { BillingDTO, PendingSetupDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";
import { useBillingOverview, useCheckout, useSubscribe } from "./api";
import { CycleSwitch, PlanCards } from "./plan-cards";

const formatDay = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
const fingerprint = (billing: BillingDTO) => `${billing.status}|${billing.plan}|${billing.paidUntil}|${billing.autoPay}`;

/** An auto-pay set-up that is waiting to be approved on Razorpay's page (usually open in another tab). */
function PendingSetup({ setup }: { setup: PendingSetupDTO }) {
  const price = formatPlanPrice(setup.amount);
  return (
    <section role="status" className="mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
      <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold tracking-tight">Finish setting up auto-pay for {PLANS[setup.plan].name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve it on Razorpay's page with UPI AutoPay or a card.{" "}
          {setup.firstChargeAt
            ? `Your first ${price} is taken on ${formatDay(setup.firstChargeAt)}, not today – Razorpay may take ₹5 to check your card or UPI and refunds it.`
            : `${price} is taken now, and then every month.`}{" "}
          This page updates by itself once it's done.
        </p>
        <Button asChild size="sm" className="mt-3">
          <a href={setup.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open Razorpay's page
          </a>
        </Button>
      </div>
    </section>
  );
}

/**
 * Monthly / yearly switch, the plans, and a button on each. A monthly plan is paid by auto-pay (a
 * mandate approved once on Razorpay's page, in a new tab); a year – or a single month, for people who
 * don't want a mandate – is one payment on Razorpay's page, which sends them back here.
 */
export function PlanChooser({ billing }: { billing: BillingDTO }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [monthByMonth, setMonthByMonth] = useState(false);
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const [confirmOneOff, setConfirmOneOff] = useState<Plan | null>(null);
  const { data: overview } = useBillingOverview();
  const checkout = useCheckout();
  const subscribe = useSubscribe();
  const queryClient = useQueryClient();

  // The overview is checked against Razorpay each time it loads, so it can be ahead of the session.
  const current = overview?.billing ?? billing;
  const onPlan = current.status === "active" ? current.plan : null;
  const autoPayOn = current.status === "active" && current.autoPay === "on";
  const hasMandate = current.autoPay === "on" || current.autoPay === "retrying";
  const canPay = current.enabled && current.status !== "exempt";
  const autoPay = cycle === "monthly" && !monthByMonth;
  // Stays busy after a one-off checkout succeeds: the browser is on its way to the payment page.
  const busy = checkout.isPending || checkout.isSuccess || subscribe.isPending;

  // When the overview has moved on (a mandate approved, a charge received), bring the session along –
  // that is what unlocks the app and updates the banner.
  const seen = fingerprint(billing);
  const latest = overview ? fingerprint(overview.billing) : null;
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!latest || latest === seen || reported.current === latest) return;
    reported.current = latest;
    void queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [latest, seen, queryClient]);

  // Say so when a set-up started here (or found waiting) has been approved. Razorpay can be quick
  // enough that the "waiting" state is never seen, so the click itself counts as waiting too.
  const pending = overview?.pendingSetup ?? null;
  const livePlan = overview?.autoPay?.state === "on" ? overview.autoPay.plan : null;
  const waitingFor = useRef<PlanId | null>(null);
  const hadPending = useRef(false);
  useEffect(() => {
    if (pending) {
      waitingFor.current = pending.plan;
      hadPending.current = true;
      return;
    }
    if (waitingFor.current && livePlan === waitingFor.current) {
      toast.success("Auto-pay is set up. Thank you!");
      waitingFor.current = null;
    } else if (hadPending.current) {
      // It was waiting and is no longer, without being approved: the page expired.
      waitingFor.current = null;
    }
    hadPending.current = false;
  }, [pending, livePlan]);

  const payOnce = (plan: Plan) => checkout.mutate({ plan: plan.id, cycle }, { onError: (error) => toast.error(errorMessage(error, "Could not open the payment page.")) });

  const choose = (plan: Plan) => {
    setChosen(plan.id);
    if (!autoPay) return hasMandate ? setConfirmOneOff(plan) : payOnce(plan);
    // The tab is opened inside the click (so pop-up blockers allow it) and pointed at Razorpay once
    // the address is known. If the browser refuses, the box above the plans offers the same link.
    const tab = window.open("", "_blank");
    subscribe.mutate(
      { plan: plan.id },
      {
        onSuccess: ({ url }) => {
          waitingFor.current = plan.id;
          if (!tab) return void toast.info("Your browser blocked the new tab. Use “Open Razorpay's page” above to continue.");
          tab.opener = null;
          tab.location.replace(url);
        },
        onError: (error) => {
          tab?.close();
          toast.error(errorMessage(error, "Could not start auto-pay."));
        },
      },
    );
  };

  const label = (plan: Plan) => {
    if (!autoPay) return `Pay ${formatPlanPrice(plan.price[cycle])} for 1 ${cycle === "yearly" ? "year" : "month"}`;
    if (plan.id === onPlan) return autoPayOn ? "Auto-pay is on" : "Turn on auto-pay";
    return onPlan ? `Switch to ${plan.name}` : `Choose ${plan.name}`;
  };

  return (
    <div>
      {pending && <PendingSetup setup={pending} />}
      <CycleSwitch value={cycle} onChange={setCycle} className="mx-auto" />
      <PlanCards
        cycle={cycle}
        className="mt-8"
        badge={(plan) => (plan.id === onPlan ? "Your plan" : null)}
        action={(plan) => (
          <Button variant={plan.popular ? "default" : "outline"} disabled={!canPay || busy || (autoPay && plan.id === onPlan && autoPayOn)} onClick={() => choose(plan)}>
            {busy && chosen === plan.id && <LoaderCircle className="animate-spin" />}
            {label(plan)}
          </Button>
        )}
      />
      <p className="mx-auto mt-6 max-w-2xl text-center text-[13px] text-balance text-muted-foreground">
        {!canPay ? (
          current.status === "exempt" ? (
            "This workspace doesn't need a plan."
          ) : (
            "Online payments are being set up. Everything stays unlocked until then."
          )
        ) : cycle === "yearly" ? (
          "One payment for the whole year by UPI, card or netbanking on Razorpay's secure page. Nothing renews by itself – we'll remind you before it ends."
        ) : monthByMonth ? (
          <>
            One payment for one month. Nothing renews by itself – we'll remind you before it ends.{" "}
            <button type="button" className="font-medium text-foreground underline underline-offset-2 hover:no-underline" onClick={() => setMonthByMonth(false)}>
              Use auto-pay instead
            </button>
          </>
        ) : (
          <>
            Monthly plans renew by auto-pay: approve UPI AutoPay or a card once on Razorpay's secure page, and turn it off here whenever you like.{" "}
            <button type="button" className="font-medium text-foreground underline underline-offset-2 hover:no-underline" onClick={() => setMonthByMonth(true)}>
              Pay month by month instead
            </button>
          </>
        )}
      </p>

      <ConfirmDialog
        open={confirmOneOff !== null}
        onOpenChange={(open) => !open && setConfirmOneOff(null)}
        title="Pay once and turn off auto-pay?"
        description={`Monthly auto-pay stops as soon as this payment is received, and ${cycle === "yearly" ? "a year" : "a month"} is added to your plan.`}
        confirmLabel="Continue to payment"
        destructive={false}
        onConfirm={() => {
          if (confirmOneOff) payOnce(confirmOneOff);
          setConfirmOneOff(null);
        }}
      />
    </div>
  );
}
