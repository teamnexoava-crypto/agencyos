import { todayIso } from "./format";
import { formatIndianDate } from "@shared/dates";

export type RangePreset = "this_month" | "last_3_months" | "last_12_months" | "this_fy" | "custom";

export interface RangeSelection {
  preset: RangePreset;
  /** Only used when preset is "custom". */
  from: string;
  to: string;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "this_fy", label: "This FY (Apr–Mar)" },
  { value: "custom", label: "Custom range" },
];

const iso = (year: number, monthIndex: number, day: number) => {
  // Date.UTC normalises overflow (month 12 → next January, day 0 → last day of previous month).
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
};

/** Turns a selection into concrete inclusive dates, relative to today in the viewer's timezone. */
export function resolveRange(selection: RangeSelection, today = todayIso()): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  switch (selection.preset) {
    case "this_month":
      return { from: iso(year, month, 1), to: iso(year, month + 1, 0) };
    case "last_3_months":
      return { from: iso(year, month - 2, 1), to: iso(year, month + 1, 0) };
    case "last_12_months":
      return { from: iso(year, month - 11, 1), to: iso(year, month + 1, 0) };
    case "this_fy": {
      // Indian financial year: 1 April – 31 March.
      const start = month >= 3 ? year : year - 1;
      return { from: iso(start, 3, 1), to: iso(start + 1, 2, 31) };
    }
    case "custom":
      return selection.from && selection.to && selection.from <= selection.to ? { from: selection.from, to: selection.to } : { from: iso(year, month, 1), to: iso(year, month + 1, 0) };
  }
}

export const DEFAULT_RANGE: RangeSelection = { preset: "this_fy", from: "", to: "" };

/**
 * "2026-09" → "Sep", "Sep '26" (chart axes whose range spans years – a bare "Sep 26" reads like a
 * date) or "Sep 2026" (tables, where there is room).
 */
export function monthLabel(month: string, year: "none" | "short" | "full" = "none"): string {
  const name = formatIndianDate(new Date(`${month}-01T00:00:00Z`), { month: "short", timeZone: "UTC" });
  if (year === "none") return name;
  return year === "short" ? `${name} '${month.slice(2, 4)}` : `${name} ${month.slice(0, 4)}`;
}
