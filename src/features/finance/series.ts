export interface SeriesKey {
  key: string;
  label: string;
  /** A validated chart token, e.g. var(--chart-1). */
  color: string;
  shape: "bar" | "line";
}

/** Series colours are fixed to the entity (revenue is always blue, expenses always orange) across every chart. */
export const REVENUE_EXPENSE_SERIES: SeriesKey[] = [
  { key: "revenue", label: "Revenue", color: "var(--chart-1)", shape: "bar" },
  { key: "expenses", label: "Expenses", color: "var(--chart-2)", shape: "bar" },
];

export const PROFIT_SERIES: SeriesKey[] = [{ key: "profit", label: "Profit", color: "var(--chart-3)", shape: "line" }];
