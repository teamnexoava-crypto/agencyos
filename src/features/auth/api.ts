import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthConfigResponse, MeResponse } from "@shared/types";
import { api, setCsrfToken } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

/**
 * The signed-in user, their active workspace and role. Resolves to `null` when signed out
 * (the endpoint answers 200 + `null` rather than 401, so public pages don't log console errors).
 * Also captures the CSRF token that every mutation needs.
 */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async ({ signal }): Promise<MeResponse | null> => {
      const me = await api<MeResponse | null>("/api/auth/me", { signal });
      setCsrfToken(me?.csrfToken ?? "");
      return me;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/** For screens rendered inside the authenticated shell, where `me` is guaranteed to be loaded. */
export function useSession() {
  const { data } = useMe();
  if (!data?.workspace || !data.membership) {
    throw new Error("useSession() used outside an authenticated, workspace-scoped route");
  }
  const role = data.membership.role;
  return {
    user: data.user,
    workspace: data.workspace,
    membership: data.membership,
    role,
    isOwner: role === "owner",
    /** Owner/admin: may see finances and manage the workspace. */
    canManage: role === "owner" || role === "admin",
  };
}

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: ({ signal }) => api<AuthConfigResponse>("/api/auth/config", { signal }),
    staleTime: Infinity,
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      setCsrfToken("");
      // A full page load (rather than a client-side redirect) guarantees that every cached query and
      // all in-memory state from this account is gone before anyone else signs in on this device.
      window.location.assign("/login");
    },
  });
}

/** Local development only – see worker/routes/auth.ts. */
export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/auth/dev-login", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
