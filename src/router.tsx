import type { ComponentType, ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useRouteError } from "react-router";
import { ErrorState } from "@/components/shared/error-state";
import { useSession } from "@/features/auth/api";
import { RedirectIfAuthenticated, RequireAuth } from "@/features/auth/guards";
import type * as ComingSoonPages from "@/pages/app/coming-soon";
import LandingPage from "@/pages/landing";
import NotFoundPage from "@/pages/not-found";

function RouteError() {
  const error = useRouteError();
  console.error(error);
  return <ErrorState fullPage title="This page crashed" description="An unexpected error occurred. Reloading usually fixes it." onRetry={() => window.location.reload()} />;
}

/**
 * UI-level guard for owner/admin-only sections. This only hides screens — the API enforces the same
 * rule on every request, so a member typing the URL gets nothing either way.
 */
function ManagersOnly({ children }: { children: ReactNode }) {
  const { canManage } = useSession();
  return canManage ? children : <Navigate to="/app" replace />;
}

/**
 * Route-level code splitting: each page is its own chunk, fetched when first visited. React Router
 * waits for the chunk before switching pages, so there is no spinner flash between routes.
 */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
const comingSoon = (name: keyof typeof ComingSoonPages) => async () => ({
  Component: (await import("@/pages/app/coming-soon"))[name],
});

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    // Shown only while the very first lazy chunk downloads on a hard load.
    hydrateFallbackElement: <div className="min-h-dvh bg-background" />,
    children: [
      // The landing page is the front door – keep it in the main bundle so it paints immediately.
      { path: "/", element: <LandingPage /> },
      { path: "/privacy", lazy: async () => ({ Component: (await import("@/pages/legal")).PrivacyPage }) },
      { path: "/terms", lazy: async () => ({ Component: (await import("@/pages/legal")).TermsPage }) },
      {
        path: "/login",
        element: (
          <RedirectIfAuthenticated>
            <Outlet />
          </RedirectIfAuthenticated>
        ),
        children: [{ index: true, lazy: page(() => import("@/pages/login")) }],
      },
      {
        path: "/onboarding",
        element: (
          <RequireAuth require="onboarding">
            <Outlet />
          </RequireAuth>
        ),
        children: [{ index: true, lazy: page(() => import("@/pages/onboarding")) }],
      },
      {
        path: "/no-workspace",
        element: (
          <RequireAuth require="no-workspace">
            <Outlet />
          </RequireAuth>
        ),
        children: [{ index: true, lazy: page(() => import("@/pages/no-workspace")) }],
      },
      {
        path: "/app",
        element: (
          <RequireAuth require="app">
            <Outlet />
          </RequireAuth>
        ),
        children: [
          {
            lazy: async () => ({ Component: (await import("@/components/layout/app-shell")).AppShell }),
            children: [
              { index: true, lazy: page(() => import("@/pages/app/dashboard")) },
              { path: "projects", lazy: page(() => import("@/pages/app/projects")) },
              { path: "projects/:projectId", lazy: page(() => import("@/pages/app/project-detail")) },
              { path: "team", lazy: comingSoon("TeamPage") },
              {
                element: (
                  <ManagersOnly>
                    <Outlet />
                  </ManagersOnly>
                ),
                children: [
                  { path: "clients", lazy: page(() => import("@/pages/app/clients")) },
                  { path: "clients/:clientId", lazy: page(() => import("@/pages/app/client-detail")) },
                  { path: "invoices", lazy: comingSoon("InvoicesPage") },
                  { path: "finance", lazy: comingSoon("FinancePage") },
                  { path: "contracts", lazy: comingSoon("ContractsPage") },
                  { path: "settings", lazy: comingSoon("SettingsPage") },
                ],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
