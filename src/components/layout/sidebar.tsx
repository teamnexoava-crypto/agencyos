import { AnimatePresence, motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { NavLink } from "react-router";
import { WorkspaceLogo } from "@/components/shared/workspace-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/features/auth/api";
import { cn } from "@/lib/utils";
import { SETTINGS_ITEM, canAccess, navForRole, type NavItem } from "./nav";

export const SIDEBAR_WIDTH = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

interface SidebarNavProps {
  collapsed: boolean;
  /** Distinguishes the desktop rail from the mobile drawer so their shared-layout animations don't collide. */
  instance: "desktop" | "mobile";
  onNavigate?: () => void;
}

function SidebarLink({ item, collapsed, instance, onNavigate }: SidebarNavProps & { item: NavItem }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150",
          isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            // One shared element that glides between items as the route changes.
            <motion.span
              layoutId={`sidebar-active-${instance}`}
              className="absolute inset-0 rounded-lg bg-sidebar-accent"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            >
              <span className="absolute top-2 bottom-2 -left-px w-[3px] rounded-full bg-primary" />
            </motion.span>
          )}
          <Icon className={cn("relative size-[18px] shrink-0", isActive && "text-primary")} />
          {!collapsed && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/** Workspace identity + navigation. Shared by the desktop rail and the mobile drawer. */
export function SidebarNav({ collapsed, instance, onNavigate }: SidebarNavProps) {
  const { workspace, role } = useSession();
  const sections = navForRole(role);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
        <WorkspaceLogo name={workspace.name} logoUrl={workspace.logoUrl} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm leading-tight font-semibold">{workspace.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="space-y-1">
            {section.title &&
              (collapsed ? (
                <div aria-hidden="true" className="mx-2 mb-2 h-px bg-sidebar-border" />
              ) : (
                <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{section.title}</p>
              ))}
            {section.items.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} instance={instance} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      {canAccess(SETTINGS_ITEM, role) && (
        <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
          <SidebarLink item={SETTINGS_ITEM} collapsed={collapsed} instance={instance} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

interface DesktopSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Fixed, collapsible rail for ≥ lg screens. Width animates; labels fade out when collapsed. */
export function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="group/sidebar fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar lg:block print:!hidden"
    >
      <div className="h-full overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={collapsed ? "collapsed" : "expanded"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="h-full"
            style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
          >
            <SidebarNav collapsed={collapsed} instance="desktop" />
          </motion.div>
        </AnimatePresence>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="absolute top-5 -right-3 z-10 flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-soft transition-opacity duration-150 group-hover/sidebar:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <PanelLeft className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {collapsed ? "Expand" : "Collapse"} <kbd className="ml-1 opacity-70">[</kbd>
        </TooltipContent>
      </Tooltip>
    </motion.aside>
  );
}
