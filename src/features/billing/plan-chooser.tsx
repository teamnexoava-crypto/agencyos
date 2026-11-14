import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { BillingCycle, PlanId } from "@shared/plans";
import type { BillingDTO } from "@shared/types";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useCheckout } from "./api";
import { CycleSwitch, PlanCards } from "./plan-cards";

/** Monthly / yearly switch, the plans, and a button on each that opens the payment page. */
export function PlanChooser({ billing }: { billing: BillingDTO }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const checkout = useCheckout();
  const onPlan = billing.status === "active" ? billing.plan : null;
  const canPay = billing.enabled && billing.status !== "exempt";
  // Stays busy after success too: the browser is on its way to the payment page.
  const busy = checkout.isPending || checkout.isSuccess;

  return (
    <div>
      <CycleSwitch value={cycle} onChange={setCycle} className="mx-auto" />
      <PlanCards
        cycle={cycle}
        className="mt-8"
        badge={(plan) => (plan.id === onPlan ? "Your plan" : null)}
        action={(plan) => (
          <Button
            variant={plan.popular ? "default" : "outline"}
            disabled={!canPay || busy}
            onClick={() => {
              setChosen(plan.id);
              checkout.mutate({ plan: plan.id, cycle }, { onError: (error) => toast.error(errorMessage(error, "Could not open the payment page.")) });
            }}
          >
            {busy && chosen === plan.id && <LoaderCircle className="animate-spin" />}
            {plan.id === onPlan ? `Extend ${plan.name}` : onPlan ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
          </Button>
        )}
      />
      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {canPay ? "Pay by UPI, card or netbanking on Razorpay's secure page. No auto-debit – you renew when you choose." : billing.status === "exempt" ? "This workspace doesn't need a plan." : "Online payments are being set up. Everything stays unlocked until then."}
      </p>
    </div>
  );
}
