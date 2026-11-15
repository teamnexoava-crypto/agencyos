import { formatIndianDate } from "@shared/dates";

/** "Priya Sharma" → "PS", "acme" → "AC". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------------------------------------
 * Money & dates
 * ---------------------------------------------------------------------------------------------- */

const LOCALES: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AED: "en-AE", AUD: "en-AU", CAD: "en-CA", SGD: "en-SG" };

/** Formats an amount held in minor units (paise), e.g. 2500000 → "₹25,000". Paise shown only when present. */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(LOCALES[currency] ?? "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Today's calendar date in the user's timezone as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "2026-11-13" → "13 Nov 2026" (year dropped when it is the current year). Timezone-safe. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const sameYear = iso.slice(0, 4) === todayIso().slice(0, 4);
  return formatIndianDate(date, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** Whole days from today to `iso` (negative = in the past). */
export function daysUntil(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type DueTone = "overdue" | "soon" | "normal" | "done";

/** Human due-date label with urgency, e.g. { text: "Due in 3 days", tone: "soon" }. */
export function dueLabel(iso: string, done = false): { text: string; tone: DueTone } {
  if (done) return { text: formatDate(iso), tone: "done" };
  const days = daysUntil(iso);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { text: `Due in ${days} days`, tone: "soon" };
  return { text: `Due ${formatDate(iso)}`, tone: "normal" };
}

/** Compact amount for chart axes: ₹45K, ₹1.2L, ₹3.1Cr (Indian units for INR; K / M elsewhere). */
export function formatMoneyCompact(minor: number, currency: string): string {
  const value = minor / 100;
  const symbol = new Intl.NumberFormat(LOCALES[currency] ?? "en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(0).replace(/[\d\s.,]/g, "");
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (currency === "INR") {
    if (abs >= 1e7) return `${sign}${symbol}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${symbol}${trim(abs / 1e5)}L`;
  } else if (abs >= 1e6) {
    return `${sign}${symbol}${trim(abs / 1e6)}M`;
  }
  if (abs >= 1e3) return `${sign}${symbol}${trim(abs / 1e3)}K`;
  return `${sign}${symbol}${trim(abs)}`;
}

/** "3 hours ago", "yesterday" – for activity feeds. `now` is passed in so rendering stays pure. */
export function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 60) return "just now";
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return formatter.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 30 * 86_400) return formatter.format(-Math.floor(seconds / 86_400), "day");
  return formatIndianDate(new Date(timestamp), { day: "numeric", month: "short" });
}

/** 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit] ?? "KB"}`;
}
