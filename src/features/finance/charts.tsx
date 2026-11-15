import { useReducedMotion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PROJECT_STATUSES, type ProjectStatus } from "@shared/constants";
import type { MonthlyPoint } from "@shared/types";
import { STATUS_META } from "@/features/projects/meta";
import { monthLabel } from "@/lib/date-range";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { PROFIT_SERIES, REVENUE_EXPENSE_SERIES, type SeriesKey } from "./series";

/*
 * Chart conventions (kept identical across the app):
 *  - colours come from the validated --chart-* / --status-* tokens, never ad-hoc hex;
 *  - text (ticks, legends, tooltips) uses text tokens – only the marks carry the series colour;
 *  - one y-axis, recessive hairline grid, bars ≤ 24px with a 4px rounded data end;
 *  - every chart has a hover tooltip and a screen-reader table with the same numbers.
 */

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

/**
 * Round axis ticks (…, 0, 50K, 1L, 1.5L, …) covering [min, max]. Values are minor units, so the step
 * is chosen in major units – otherwise "nice" numbers in paise come out as odd amounts in rupees.
 */
function niceTicks(values: number[], intervals = 4): number[] {
  const min = Math.min(0, ...values) / 100;
  const max = Math.max(0, ...values) / 100;
  const rough = (max - min || 1) / intervals;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
  const ticks: number[] = [];
  for (let value = Math.floor(min / step) * step; value <= Math.ceil(max / step) * step + step / 2; value += step) ticks.push(Math.round(value * 100));
  return ticks;
}

/** Legend rows mirror the mark (block for bars, stroke for lines); the text stays in text tokens. */
export function ChartLegend({ series }: { series: SeriesKey[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={item.shape === "bar" ? "size-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full"} style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface MoneyTooltipProps {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  label?: unknown;
  currency: string;
  series: SeriesKey[];
}

function MoneyTooltip({ active, payload, label, currency, series }: MoneyTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2.5 text-xs shadow-lift">
      <p className="mb-1.5 font-medium text-foreground">{String(label ?? "")}</p>
      <ul className="space-y-1">
        {series.map((item) => {
          const entry = payload.find((row) => row.dataKey === item.key);
          if (!entry) return null;
          return (
            <li key={item.key} className="flex items-center justify-between gap-5">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              {/* Values lead: the reader already knows the series and wants the number. */}
              <span className="tabular font-semibold text-foreground">{formatMoney(Number(entry.value ?? 0), currency)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useChartRows(data: MonthlyPoint[]) {
  const spansYears = new Set(data.map((point) => point.month.slice(0, 4))).size > 1;
  return data.map((point) => ({ ...point, label: monthLabel(point.month, spansYears ? "short" : "none") }));
}

/** Screen-reader (and no-hover) equivalent of a monthly chart. */
function MonthlyTable({ rows, currency, columns }: { rows: ReturnType<typeof useChartRows>; currency: string; columns: { key: "revenue" | "expenses" | "profit"; label: string }[] }) {
  return (
    <table className="sr-only">
      <caption>Monthly figures</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          {columns.map((column) => (
            <th key={column.key} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row">{row.label}</th>
            {columns.map((column) => (
              <td key={column.key}>{formatMoney(row[column.key], currency)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Shows every n-th month label so they are evenly spaced and never collide (about six across the chart). */
const labelInterval = (points: number) => Math.max(0, Math.ceil(points / 6) - 1);

/** Marks draw themselves in once when a chart appears – unless the person prefers reduced motion. */
function useChartMotion() {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const };
}

/** Monthly money in vs money out: two series compared on one axis → grouped columns. */
export function RevenueExpensesChart({ data, currency }: { data: MonthlyPoint[]; currency: string }) {
  const motion = useChartMotion();
  const rows = useChartRows(data);
  const ticks = niceTicks(data.flatMap((point) => [point.revenue, point.expenses]));
  return (
    <figure aria-label="Revenue and expenses by month">
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="24%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} tickMargin={8} interval={labelInterval(rows.length)} />
            <YAxis ticks={ticks} domain={[ticks[0] ?? 0, ticks.at(-1) ?? 0]} tickFormatter={(value: number) => formatMoneyCompact(value, currency)} tickLine={false} axisLine={false} tick={TICK} width={56} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={({ active, payload, label }) => <MoneyTooltip active={active} payload={payload} label={label} currency={currency} series={REVENUE_EXPENSE_SERIES} />} />
            {REVENUE_EXPENSE_SERIES.map((series, index) => (
              <Bar key={series.key} dataKey={series.key} fill={series.color} radius={[4, 4, 0, 0]} maxBarSize={24} {...motion} animationBegin={index * 90} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <MonthlyTable rows={rows} currency={currency} columns={[{ key: "revenue", label: "Revenue" }, { key: "expenses", label: "Expenses" }]} />
    </figure>
  );
}

/** Profit over time: a single series, so a 2px line with a light wash and a zero baseline. */
export function ProfitTrendChart({ data, currency }: { data: MonthlyPoint[]; currency: string }) {
  const motion = useChartMotion();
  const rows = useChartRows(data);
  const ticks = niceTicks(data.map((point) => point.profit));
  return (
    <figure aria-label="Profit by month">
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} tickMargin={8} interval={labelInterval(rows.length)} />
            <YAxis ticks={ticks} domain={[ticks[0] ?? 0, ticks.at(-1) ?? 0]} tickFormatter={(value: number) => formatMoneyCompact(value, currency)} tickLine={false} axisLine={false} tick={TICK} width={56} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }} content={({ active, payload, label }) => <MoneyTooltip active={active} payload={payload} label={label} currency={currency} series={PROFIT_SERIES} />} />
            <Area
              // Straight segments: a smoothed curve overshoots between months and would show values that never happened.
              type="linear"
              dataKey="profit"
              stroke="var(--chart-3)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="var(--chart-3)"
              fillOpacity={0.1}
              // Markers carry a 2px ring in the surface colour so they stay legible on the line.
              dot={rows.length <= 12 ? { r: 4, fill: "var(--chart-3)", stroke: "var(--card)", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: "var(--chart-3)", stroke: "var(--card)", strokeWidth: 2 }}
              {...motion}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <MonthlyTable rows={rows} currency={currency} columns={[{ key: "profit", label: "Profit" }]} />
    </figure>
  );
}

/** Ring order chosen so every neighbouring pair (including the wrap-around) stays distinguishable for colour-blind readers. */
const RING_ORDER: ProjectStatus[] = ["lead", "on_hold", "completed", "in_progress", "cancelled"];

/** Project status split. The legend beside the ring carries every name and count, so colour is never the only cue. */
export function ProjectStatusDonut({ counts }: { counts: Record<ProjectStatus, number> }) {
  const motion = useChartMotion();
  const total = PROJECT_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const slices = RING_ORDER.filter((status) => counts[status] > 0).map((status) => ({ status, name: STATUS_META[status].label, value: counts[status], color: STATUS_META[status].color }));

  return (
    <figure aria-label={`Project status: ${PROJECT_STATUSES.map((status) => `${counts[status]} ${STATUS_META[status].label}`).join(", ")}`} className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-40 shrink-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} startAngle={90} endAngle={-270} stroke="var(--card)" strokeWidth={2} {...motion}>
              {slices.map((slice) => (
                <Cell key={slice.status} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const slice = payload?.[0];
                if (!active || !slice) return null;
                return (
                  <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lift">
                    <span className="tabular font-semibold text-foreground">{String(slice.value)}</span> <span className="text-muted-foreground">{String(slice.name)}</span>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl leading-none font-semibold tracking-tight">{total}</span>
          <span className="mt-1 text-xs text-muted-foreground">project{total === 1 ? "" : "s"}</span>
        </div>
      </div>
      <ul className="grid w-full gap-2 text-sm">
        {PROJECT_STATUSES.map((status) => (
          <li key={status} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: STATUS_META[status].color }} />
              {STATUS_META[status].label}
            </span>
            <span className="tabular font-medium">{counts[status]}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

interface RankedBarsProps {
  rows: { id: string; label: string; value: number; color?: string }[];
  format: (value: number) => string;
  emptyText: string;
}

/** Ranked horizontal bars: one hue, largest first, the value printed at the end of each row. */
export function RankedBars({ rows, format, emptyText }: RankedBarsProps) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="grid gap-3.5">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {row.color && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular shrink-0 font-medium">{format(row.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-(--chart-1)" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
