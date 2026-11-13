import { Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "./notifications-popover";
import { UserMenu } from "./user-menu";

interface TopbarProps {
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function Topbar({ onOpenMobileNav, onOpenSearch }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-xl sm:gap-3 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      <button
        type="button"
        onClick={onOpenSearch}
        className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-soft transition-colors hover:border-input hover:text-foreground sm:max-w-sm"
        aria-label="Search"
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search…</span>
        <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium sm:block">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <ThemeToggle />
        <NotificationsPopover />
        <div className="ml-1.5">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
