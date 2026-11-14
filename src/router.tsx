import type { ComponentType, ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useRouteError } from "react-router";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { useSession } from "@/features/auth/api";
import { RedirectIfAuthenticated, RequireAuth } from "@/features/auth/guards";
import { useIsLocked, type LockedFeature } from "@/features/billing/locked";
import { UpgradeNotice } from "@/features/billing/upgrade-notice";
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

/** A whole section the workspace's plan may not include: shows what it is and how to get it instead. */
function RequireFeature({ feature, title, description }: { feature: LockedFeature; title: string; description: string }) {
  const locked = useIsLocked(feature);
  if (!locked) return <Outlet />;
  return (
    <>
      <PageHeader title={title} description={description} />
      <UpgradeNotice feature={feature} />
    </>
  );
}

/**
 * Route-level code splitting: each page is its own chunk, fetched when first visited. React Router
 * waits for the chunk before switching pages, so there is no spinner flash between routes.
 */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    // Shown only while the very first lazy chunk downloads on a hard load.
    hydrateFallbackElement: <div className="min-h-dvh bg-background" />,
    children: [
      // The landing page is the front door – keep it in the main bundle so it paints immediately.
      { path: "/", element: <LandingPage /> },
      { path: "/privacy", lazy: async () => ({ Component: (await import("@/pages/legal")).PrivacyPage }) },
      // Public invoice link – what the client opens. No login, no app shell.
      { path: "/i/:token", lazy: page(() => import("@/pages/public-invoice")) },
      // Public contract link – where the client reads and signs.
      { path: "/c/:token", lazy: page(() => import("@/pages/public-contract")) },
      // Client portal – one private page per project.
      { path: "/p/:token", lazy: page(() => import("@/pages/public-portal")) },
      // Invite links work signed in or out, with or without a workspace – so no guard here.
      { path: "/invite/:token", lazy: page(() => import("@/pages/invite")) },
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
              { path: "crm", lazy: page(() => import("@/pages/app/crm")) },
              { path: "team", lazy: page(() => import("@/pages/app/team")) },
              { path: "team/:memberId", lazy: page(() => import("@/pages/app/member-detail")) },
              {
                element: (
                  <ManagersOnly>
                    <Outlet />
                  </ManagersOnly>
                ),
                children: [
                  { path: "clients", lazy: page(() => import("@/pages/app/clients")) },
                  { path: "clients/:clientId", lazy: page(() => import("@/pages/app/client-detail")) },
                  { path: "invoices", lazy: page(() => import("@/pages/app/invoices")) },
                  { path: "invoices/new", lazy: async () => ({ Component: (await import("@/pages/app/invoice-form")).NewInvoicePage }) },
                  { path: "invoices/:invoiceId", lazy: page(() => import("@/pages/app/invoice-detail")) },
                  { path: "invoices/:invoiceId/edit", lazy: async () => ({ Component: (await import("@/pages/app/invoice-form")).EditInvoicePage }) },
                  {
                    element: <RequireFeature feature="finance" title="Finance" description="Expenses, and profit and loss." />,
                    children: [{ path: "finance", lazy: page(() => import("@/pages/app/finance")) }],
                  },
                  { path: "contracts", lazy: page(() => import("@/pages/app/contracts")) },
                  { path: "contracts/:contractId", lazy: page(() => import("@/pages/app/contract-detail")) },
                  { path: "settings", lazy: page(() => import("@/pages/app/settings")) },
                  { path: "billing", lazy: page(() => import("@/pages/app/billing")) },
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
