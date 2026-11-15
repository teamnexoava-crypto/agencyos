import type { ComponentType, ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useRouteError } from "react-router";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { useSession } from "@/features/auth/api";
import { RedirectIfAuthenticated, RequireAuth } from "@/features/auth/guards";
import { useIsLocked, type LockedFeature } from "@/features/billing/locked";
import { UpgradeNotice } from "@/features/billing/upgrade-notice";
import { useRouteTitle } from "@/lib/document-title";
import LandingPage from "@/pages/landing";
import NotFoundPage from "@/pages/not-found";

/** The root of every page: keeps the browser tab named after the page. */
function Root() {
  useRouteTitle();
  return <Outlet />;
}

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
    element: <Root />,
    errorElement: <RouteError />,
    // Shown only while the very first lazy chunk downloads on a hard load.
    hydrateFallbackElement: <div className="min-h-dvh bg-background" />,
    children: [
      // The landing page is the front door – keep it in the main bundle so it paints immediately.
      { path: "/", element: <LandingPage /> },
      { handle: { title: "Privacy Policy" }, path: "/privacy", lazy: async () => ({ Component: (await import("@/pages/legal")).PrivacyPage }) },
      // Public invoice link – what the client opens. No login, no app shell.
      { handle: { title: "Invoice" }, path: "/i/:token", lazy: page(() => import("@/pages/public-invoice")) },
      // Public contract link – where the client reads and signs.
      { handle: { title: "Contract" }, path: "/c/:token", lazy: page(() => import("@/pages/public-contract")) },
      // Client portal – one private page per project.
      { handle: { title: "Project" }, path: "/p/:token", lazy: page(() => import("@/pages/public-portal")) },
      // Invite links work signed in or out, with or without a workspace – so no guard here.
      { handle: { title: "Join a workspace" }, path: "/invite/:token", lazy: page(() => import("@/pages/invite")) },
      { handle: { title: "Terms of Service" }, path: "/terms", lazy: async () => ({ Component: (await import("@/pages/legal")).TermsPage }) },
      { handle: { title: "Cancellation & Refund Policy" }, path: "/refunds", lazy: async () => ({ Component: (await import("@/pages/legal")).RefundPage }) },
      { handle: { title: "Contact us" }, path: "/contact", lazy: async () => ({ Component: (await import("@/pages/legal")).ContactPage }) },
      { handle: { title: "About" }, path: "/about", lazy: async () => ({ Component: (await import("@/pages/legal")).AboutPage }) },
      {
        path: "/login",
        element: (
          <RedirectIfAuthenticated>
            <Outlet />
          </RedirectIfAuthenticated>
        ),
        children: [{ index: true, handle: { title: "Sign in" }, lazy: page(() => import("@/pages/login")) }],
      },
      {
        path: "/onboarding",
        element: (
          <RequireAuth require="onboarding">
            <Outlet />
          </RequireAuth>
        ),
        children: [{ index: true, handle: { title: "Set up your workspace" }, lazy: page(() => import("@/pages/onboarding")) }],
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
              { handle: { title: "Dashboard" }, index: true, lazy: page(() => import("@/pages/app/dashboard")) },
              { handle: { title: "My tasks" }, path: "tasks", lazy: page(() => import("@/pages/app/my-tasks")) },
              { handle: { title: "Appearance" }, path: "appearance", lazy: page(() => import("@/pages/app/appearance")) },
              { handle: { title: "Projects" }, path: "projects", lazy: page(() => import("@/pages/app/projects")) },
              { handle: { title: "Project" }, path: "projects/:projectId", lazy: page(() => import("@/pages/app/project-detail")) },
              { handle: { title: "CRM" }, path: "crm", lazy: page(() => import("@/pages/app/crm")) },
              { handle: { title: "Team" }, path: "team", lazy: page(() => import("@/pages/app/team")) },
              { handle: { title: "Team member" }, path: "team/:memberId", lazy: page(() => import("@/pages/app/member-detail")) },
              {
                element: (
                  <ManagersOnly>
                    <Outlet />
                  </ManagersOnly>
                ),
                children: [
                  { handle: { title: "Clients" }, path: "clients", lazy: page(() => import("@/pages/app/clients")) },
                  { handle: { title: "Client" }, path: "clients/:clientId", lazy: page(() => import("@/pages/app/client-detail")) },
                  { handle: { title: "Invoices" }, path: "invoices", lazy: page(() => import("@/pages/app/invoices")) },
                  { handle: { title: "New invoice" }, path: "invoices/new", lazy: async () => ({ Component: (await import("@/pages/app/invoice-form")).NewInvoicePage }) },
                  { handle: { title: "Invoice" }, path: "invoices/:invoiceId", lazy: page(() => import("@/pages/app/invoice-detail")) },
                  { handle: { title: "Edit invoice" }, path: "invoices/:invoiceId/edit", lazy: async () => ({ Component: (await import("@/pages/app/invoice-form")).EditInvoicePage }) },
                  {
                    element: <RequireFeature feature="finance" title="Finance" description="Expenses, and profit and loss." />,
                    children: [{ handle: { title: "Finance" }, path: "finance", lazy: page(() => import("@/pages/app/finance")) }],
                  },
                  { handle: { title: "Contracts" }, path: "contracts", lazy: page(() => import("@/pages/app/contracts")) },
                  { handle: { title: "Contract" }, path: "contracts/:contractId", lazy: page(() => import("@/pages/app/contract-detail")) },
                  { handle: { title: "Settings" }, path: "settings", lazy: page(() => import("@/pages/app/settings")) },
                  { handle: { title: "Billing" }, path: "billing", lazy: page(() => import("@/pages/app/billing")) },
                ],
              },
              { path: "*", handle: { title: "Page not found" }, element: <NotFoundPage /> },
            ],
          },
        ],
      },
      { path: "*", handle: { title: "Page not found" }, element: <NotFoundPage /> },
    ],
  },
]);
