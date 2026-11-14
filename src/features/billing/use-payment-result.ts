import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { BillingOverview } from "@shared/types";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";
import { billingKeys } from "./api";

/**
 * Razorpay sends people back to /app/billing?payment=paid|pending|failed. This shows the outcome
 * once, tidies the address, and – when the payment is still being confirmed – checks again shortly.
 */
export function usePaymentResult() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const result = params.get("payment");

  useEffect(() => {
    if (!result) return;
    setParams(
      (current) => {
        current.delete("payment");
        return current;
      },
      { replace: true },
    );
    const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.me }), queryClient.invalidateQueries({ queryKey: billingKeys.overview })]);

    if (result === "paid") {
      toast.success("Payment received – your plan is active. Thank you!");
      void refresh();
      return;
    }
    if (result === "failed") {
      toast.error("The payment didn't go through. Nothing was charged – please try again.");
      return;
    }
    if (result !== "pending") return;

    toast.info("We're confirming your payment. This usually takes a few seconds.");
    // Opening the billing overview makes the server ask Razorpay again.
    const timers = [4_000, 12_000, 30_000].map((delay) =>
      window.setTimeout(() => {
        void api<BillingOverview>("/api/billing")
          .then((overview) => {
            if (overview.billing.status === "active") toast.success("Payment received – your plan is active. Thank you!");
          })
          .catch(() => undefined)
          .finally(() => void refresh());
      }, delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Runs once per value of `?payment=`; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
}
