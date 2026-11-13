import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { useMe } from "./api";

type Requirement = "app" | "onboarding" | "no-workspace";

/**
 * Gatekeeper for private routes. Decides, from the session, where the user is allowed to be:
 *   signed out            → /login?next=…
 *   no workspace          → /no-workspace
 *   owner, not onboarded  → /onboarding
 *   otherwise             → /app
 */
export function RequireAuth({ children, require }: { children: ReactNode; require: Requirement }) {
  const location = useLocation();
  const { data: me, isPending, isError, refetch } = useMe();

  if (isPending) return <FullPageSkeleton />;
  if (isError) return <ErrorState fullPage onRetry={() => void refetch()} />;

  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  const needsOnboarding = me.workspace !== null && !me.workspace.onboarded && me.membership?.role === "owner";
  const target: Requirement = me.workspace === null ? "no-workspace" : needsOnboarding ? "onboarding" : "app";

  if (target !== require) {
    const destination = target === "app" ? "/app" : target === "onboarding" ? "/onboarding" : "/no-workspace";
    return <Navigate to={destination} replace />;
  }
  return children;
}

/** For /login: signed-in users are sent straight into the app (or to the page they originally asked for). */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: me, isPending } = useMe();
  if (isPending) return <FullPageSkeleton />;
  if (me) {
    const next = new URLSearchParams(location.search).get("next");
    // Same-site paths only – never redirect to an absolute or protocol-relative URL.
    const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
    return <Navigate to={safe} replace />;
  }
  return children;
}
