import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * The server answers 402 when a trial or plan has just run out. Re-reading the session makes the app
 * switch to the "choose a plan" screen instead of showing an error on whatever was open.
 */
const onSubscriptionEnded = (error: unknown) => {
  if (error instanceof ApiError && error.status === 402) void queryClient.invalidateQueries({ queryKey: ["me"] });
};

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onSubscriptionEnded }),
  mutationCache: new MutationCache({ onError: onSubscriptionEnded }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (401/403/404/422…) will not fix themselves – only retry network/5xx once.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});

export const queryKeys = {
  me: ["me"] as const,
  authConfig: ["auth-config"] as const,
};
