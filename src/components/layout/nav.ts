import { CreditCard, FileSignature, FolderKanban, LayoutDashboard, ReceiptText, Settings, UserRoundSearch, Users, UsersRound, Wallet, type LucideIcon } from "lucide-react";
import type { Role } from "@shared/constants";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Match the path exactly (used for the dashboard at /app). */
  end?: boolean;
  /** Restrict to these roles; omitted = everyone. */
  roles?: readonly Role[];
  keywords?: string;
}

export interface NavSection {
  title: string | null;
  items: NavItem[];
}

const MANAGERS: readonly Role[] = ["owner", "admin"];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [{ label: "Dashboard", to: "/app", icon: LayoutDashboard, end: true, keywords: "home overview kpi" }],
  },
  {
    title: "Work",
    items: [
      { label: "Projects", to: "/app/projects", icon: FolderKanban, keywords: "kanban board milestones tasks" },
      { label: "CRM", to: "/app/crm", icon: UserRoundSearch, keywords: "leads pipeline sales enquiries follow-up google sheet" },
      { label: "Clients", to: "/app/clients", icon: Users, roles: MANAGERS, keywords: "customers contacts" },
      { label: "Team", to: "/app/team", icon: UsersRound, keywords: "members invite roles" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Invoices", to: "/app/invoices", icon: ReceiptText, roles: MANAGERS, keywords: "billing payments gst" },
      { label: "Finance", to: "/app/finance", icon: Wallet, roles: MANAGERS, keywords: "expenses profit loss p&l reports" },
      { label: "Contracts", to: "/app/contracts", icon: FileSignature, roles: MANAGERS, keywords: "agreements e-sign signature" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  to: "/app/settings",
  icon: Settings,
  roles: MANAGERS,
  keywords: "workspace branding tax templates",
};

export const BILLING_ITEM: NavItem = {
  label: "Billing",
  to: "/app/billing",
  icon: CreditCard,
  roles: MANAGERS,
  keywords: "plan subscription trial payment upgrade renew",
};

export function navForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}

export function canAccess(item: NavItem, role: Role): boolean {
  return !item.roles || item.roles.includes(role);
}

export function allNavItems(role: Role): NavItem[] {
  const items = navForRole(role).flatMap((section) => section.items);
  return canAccess(SETTINGS_ITEM, role) ? [...items, BILLING_ITEM, SETTINGS_ITEM] : items;
}
