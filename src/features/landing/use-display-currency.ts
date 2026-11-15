import type { BillingCurrency } from "@shared/plans";
import { useAuthConfig, useMe } from "@/features/auth/api";

/** The currency to show prices in: a signed-in workspace's own, or the one for where the visitor is. */
export function useDisplayCurrency(): BillingCurrency {
  const { data: me } = useMe();
  const { data: config } = useAuthConfig();
  return me?.billing?.currency ?? config?.currency ?? "INR";
}
