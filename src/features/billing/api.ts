import { useMutation, useQuery } from "@tanstack/react-query";
import type { CheckoutInput } from "@shared/schemas/billing";
import type { BillingOverview } from "@shared/types";
import { useMe } from "@/features/auth/api";
import { api } from "@/lib/api";

export const billingKeys = { overview: ["billing"] as const };

/** Trial / plan state of the current workspace. It arrives with the session, so it is always at hand. */
export function useBilling() {
  const { data } = useMe();
  if (!data?.billing) throw new Error("useBilling() used outside an authenticated, workspace-scoped route");
  return data.billing;
}

export function useBillingOverview() {
  return useQuery({ queryKey: billingKeys.overview, queryFn: ({ signal }) => api<BillingOverview>("/api/billing", { signal }) });
}

/** Starts a payment and takes the person to Razorpay's payment page. */
export function useCheckout() {
  return useMutation({
    mutationFn: (input: CheckoutInput) => api<{ url: string }>("/api/billing/checkout", { method: "POST", json: input }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}
