import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useLocation, useNavigation } from "react-router";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSession } from "@/features/auth/api";
import { useBilling } from "@/features/billing/api";
import { BillingBanner } from "@/features/billing/billing-banner";
import { SampleDataBanner } from "@/features/sample-data/sample-data-controls";
import { SeatLock } from "@/features/billing/paywall";
import { useMediaQuery } from "@/hooks/use-media-query";
import { PageTransition } from "./page-transition";
import { QuickNav } from "./quick-nav";
import { DesktopSidebar, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Authenticated layout: collapsible sidebar (drawer on mobile), sticky top bar, animated page outlet. */
export function AppShell() {
  const location = useLocation();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useLocalStorage("aos-sidebar-collapsed", false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigation = useNavigation();
  const billing = useBilling();
  const { isOwner } = useSession();

  // Keyboard shortcuts: ⌘K / Ctrl+K → search, "[" → toggle sidebar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      } else if (event.key === "[" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCollapsed]);

  // New page → scroll back to the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  const sidebarOffset = isDesktop ? (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) : 0;

  // The Free plan is for one person: the rest of the team waits until the owner upgrades.
  if (billing.status === "free" && !isOwner) return <SeatLock />;

  return (
    <div className="min-h-dvh bg-background print:min-h-0 print:bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Shown while the next page's code is being fetched (slow connections), so a click never feels ignored. */}
      {navigation.state === "loading" && (
        <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-50 h-0.5 print:hidden">
          <div className="route-progress h-full bg-primary" />
        </div>
      )}

      <DesktopSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />

      <Sheet open={mobileNavOpen && !isDesktop} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Browse the sections of your workspace.</SheetDescription>
          <SidebarNav collapsed={false} instance="mobile" onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <motion.div
        initial={false}
        animate={{ paddingLeft: sidebarOffset }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="flex min-h-dvh min-w-0 flex-col print:min-h-0 print:!pl-0"
      >
        <BillingBanner />
        <SampleDataBanner />
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-10 print:max-w-none print:p-0">
          <PageTransition />
        </main>
      </motion.div>

      <QuickNav open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
