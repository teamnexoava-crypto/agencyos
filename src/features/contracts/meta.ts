import type { ContractStatus } from "@shared/constants";
import { formatIndianDate } from "@shared/dates";

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; badge: string; dot: string }> = {
  draft: { label: "Draft", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300", dot: "bg-slate-400" },
  sent: { label: "Sent", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  viewed: { label: "Viewed", badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  client_signed: { label: "Needs your signature", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  completed: { label: "Signed", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  voided: { label: "Voided", badge: "bg-slate-500/10 text-slate-500 line-through dark:text-slate-400", dot: "bg-slate-400" },
};

export const contractUrl = (token: string) => `${window.location.origin}/c/${token}`;

/** Date and time with the time zone spelled out – signing times must be unambiguous. */
export const formatSignedAt = (ms: number) =>
  formatIndianDate(new Date(ms), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
