import { Lock, ShieldCheck } from "lucide-react";
import { PLANS } from "@shared/plans";
import { BrandLogo } from "@/components/shared/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { useSession } from "@/features/auth/api";
import { useBilling } from "./api";
import { PlanChooser } from "./plan-chooser";
import { usePaymentResult } from "./use-payment-result";

/**
 * Shown instead of the app once the trial or the paid plan has run out. The server refuses every
 * other request in this state, so this screen is the only way forward: pay, switch workspace, or sign out.
 */
export function Paywall() {
  const billing = useBilling();
  const { workspace, canManage } = useSession();
  usePaymentResult();
  const hadPlan = billing.plan !== null;

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
        <BrandLogo />
        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="size-5" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{hadPlan ? `Your ${billing.plan ? PLANS[billing.plan].name : ""} plan has ended` : "Your free trial has ended"}</h1>
          <p className="mt-3 text-[15px] text-balance text-muted-foreground">
            {canManage ? `Choose a plan to pick up right where you left off in ${workspace.name}.` : `Ask the owner of ${workspace.name} to choose a plan. You'll get back in as soon as they do.`}
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[13px] text-muted-foreground shadow-soft">
            <ShieldCheck className="size-3.5 text-primary" /> Your projects, invoices and contracts are safe. Links you sent to clients still open.
          </p>
        </div>

        {canManage && (
          <div className="mt-10">
            <PlanChooser billing={billing} />
          </div>
        )}
      </main>
    </div>
  );
}
