import { Clock } from "lucide-react";
import { Link, useLocation } from "react-router";
import { PLANS, RENEWAL_REMINDER_DAYS } from "@shared/plans";
import { useSession } from "@/features/auth/api";
import { cn } from "@/lib/utils";
import { useBilling } from "./api";

const days = (count: number) => (count <= 1 ? "today" : `in ${count} days`);

/** A slim reminder above the page while the trial is running, or when a paid plan is about to end. */
export function BillingBanner() {
  const billing = useBilling();
  const { canManage } = useSession();
  const { pathname } = useLocation();

  // With auto-pay set up, the trial rolls into the plan by itself: nothing to nag about.
  // A failed auto-pay charge that Razorpay is retrying: the workspace is on borrowed time.
  const retrying = billing.autoPay === "retrying" && (billing.status === "active" || billing.status === "trial");
  // With auto-pay set up, the trial rolls into the plan by itself: nothing to nag about.
  const trial = billing.status === "trial" && billing.autoPay !== "on" && !retrying;
  // With auto-pay on the plan renews by itself, so there is nothing to remind anyone of.
  const ending = billing.status === "active" && billing.autoPay !== "on" && !retrying && billing.daysLeft !== null && billing.daysLeft <= RENEWAL_REMINDER_DAYS;
  // On the Free plan the owner (the only person who gets in) is quietly reminded there is more.
  const free = billing.status === "free";
  if ((!trial && !ending && !retrying && !free) || pathname === "/app/billing") return null;

  const left = billing.daysLeft ?? 0;
  const urgent = retrying || (!free && left <= 2);
  const planName = billing.plan ? PLANS[billing.plan].name : "";
  const text = free ? "You're on the Free plan." : trial ? `Your Premium trial ends ${days(left)} – after that you're on the Free plan.` : retrying ? `We couldn't collect the payment for your ${planName ? `${planName} plan` : "plan"}.` : `Your ${planName} plan ends ${days(left)}.`;

  return (
    <div role="status" className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-2 text-center text-[13px] print:hidden", urgent ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-primary/10 text-foreground")}>
      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
      {canManage ? (
        <Link to="/app/billing" className="font-semibold underline underline-offset-2 hover:no-underline">
          {free ? "Upgrade to unlock more" : trial ? "See plans" : retrying ? "See what to do" : "Renew now"}
        </Link>
      ) : (
        <span className="text-muted-foreground">Ask the workspace owner to {trial ? "choose a plan" : retrying ? "check Billing" : "renew"}.</span>
      )}
    </div>
  );
}
