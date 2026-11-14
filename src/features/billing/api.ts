import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckoutInput, SubscribeInput } from "@shared/schemas/billing";
import type { BillingOverview } from "@shared/types";
import { useMe } from "@/features/auth/api";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

export const billingKeys = { overview: ["billing"] as const };

/** Trial / plan state of the current workspace. It arrives with the session, so it is always at hand. */
export function useBilling() {
  const { data } = useMe();
  if (!data?.billing) throw new Error("useBilling() used outside an authenticated, workspace-scoped route");
  return data.billing;
}

/**
 * Plan, auto-pay, usage and payments. Reading it makes the server check with Razorpay, so while an
 * auto-pay set-up is waiting to be approved in another tab this simply re-reads itself every few
 * seconds – and again the moment the person comes back to this tab.
 */
export function useBillingOverview() {
  return useQuery({
    queryKey: billingKeys.overview,
    queryFn: ({ signal }) => api<BillingOverview>("/api/billing", { signal }),
    refetchInterval: (query) => (query.state.data?.pendingSetup ? 5_000 : false),
    refetchOnWindowFocus: true,
  });
}

function useRefreshBilling() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: billingKeys.overview }), queryClient.invalidateQueries({ queryKey: queryKeys.me })]);
}

/** Starts a one-off payment and takes the person to Razorpay's payment page (which sends them back). */
export function useCheckout() {
  return useMutation({
    mutationFn: (input: CheckoutInput) => api<{ url: string }>("/api/billing/checkout", { method: "POST", json: input }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

/** Starts monthly auto-pay: answers with Razorpay's page where the mandate is approved. */
export function useSubscribe() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: (input: SubscribeInput) => api<{ url: string }>("/api/billing/subscribe", { method: "POST", json: input }),
    onSettled: () => void refresh(),
  });
}

/** Withdraws an auto-pay set-up that is still waiting to be approved. */
export function useCancelSetup() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/billing/setup/cancel", { method: "POST" }),
    onSettled: () => void refresh(),
  });
}

export function useCancelAutoPay() {
  const refresh = useRefreshBilling();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/billing/auto-pay/cancel", { method: "POST" }),
    onSettled: () => void refresh(),
  });
}
