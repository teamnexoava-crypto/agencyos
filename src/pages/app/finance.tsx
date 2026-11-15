import { useCallback, useMemo, useState } from "react";
import { Download, HandCoins, Plus, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useSearchParams } from "react-router";
import type { MonthlyPoint, ProfitAndLoss } from "@shared/types";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/features/auth/api";
import { Panel, StatTile } from "@/features/dashboard/panels";
import { useExpenseCategories, useExpenses, usePnl } from "@/features/finance/api";
import { ChartLegend, RankedBars, RevenueExpensesChart } from "@/features/finance/charts";
import { REVENUE_EXPENSE_SERIES } from "@/features/finance/series";
import { ExpenseDialog } from "@/features/finance/expense-dialog";
import { ExpenseList } from "@/features/finance/expense-list";
import { useProjects } from "@/features/projects/api";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { downloadCsv } from "@/lib/csv";
import { DEFAULT_RANGE, monthLabel, resolveRange, type RangeSelection } from "@/lib/date-range";
import { formatMoney, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "all";
const major = (minor: number) => minor / 100;

interface Row {
  key: string;
  label: string;
  sub?: string | null;
  revenue: number;
  expenses: number;
  profit: number;
}

/** Revenue / expenses / profit table with a totals row. Numbers are right-aligned and tabular so columns line up. */
function BreakdownTable({ caption, firstColumn, rows, currency }: { caption: string; firstColumn: string; rows: Row[]; currency: string }) {
  const money = (value: number) => formatMoney(value, currency);
  const total = rows.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, expenses: sum.expenses + row.expenses, profit: sum.profit + row.profit }), { revenue: 0, expenses: 0, profit: 0 });
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing recorded in this period.</p>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-5 py-2 font-medium">
              {firstColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Revenue
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Expenses
            </th>
            <th scope="col" className="px-5 py-2 text-right font-medium">
              Profit
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="max-w-56 px-5 py-2.5 text-left font-normal">
                <span className="block truncate">{row.label}</span>
                {row.sub && <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>}
              </th>
              <td className="tabular px-3 py-2.5 text-right">{money(row.revenue)}</td>
              <td className="tabular px-3 py-2.5 text-right">{money(row.expenses)}</td>
              <td className={cn("tabular px-5 py-2.5 text-right font-medium", row.profit < 0 && "text-destructive")}>{money(row.profit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <th scope="row" className="px-5 py-2.5 text-left">
              Total
            </th>
            <td className="tabular px-3 py-2.5 text-right">{money(total.revenue)}</td>
            <td className="tabular px-3 py-2.5 text-right">{money(total.expenses)}</td>
            <td className={cn("tabular px-5 py-2.5 text-right", total.profit < 0 && "text-destructive")}>{money(total.profit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProfitAndLossView({ pnl, range, includeTeam, onIncludeTeam }: { pnl: ProfitAndLoss; range: { from: string; to: string }; includeTeam: boolean; onIncludeTeam: (value: boolean) => void }) {
  const { workspace } = useSession();
  const currency = workspace.currency;
  const formatAmount = useCallback((value: number) => formatMoney(value, currency), [currency]);

  // Optional estimate: count each month's team salaries as an expense (for agencies that don't log payroll).
  // Only months that have started count – nobody has paid next month's salaries yet.
  const currentMonth = todayIso().slice(0, 7);
  const monthly: MonthlyPoint[] = useMemo(
    () =>
      pnl.byMonth.map((point) =>
        includeTeam && point.month <= currentMonth ? { ...point, expenses: point.expenses + pnl.teamMonthlyCost, profit: point.profit - pnl.teamMonthlyCost } : point,
      ),
    [pnl, includeTeam, currentMonth],
  );
  const totals = monthly.reduce((sum, point) => ({ revenue: sum.revenue + point.revenue, expenses: sum.expenses + point.expenses, profit: sum.profit + point.profit }), { revenue: 0, expenses: 0, profit: 0 });
  const stamp = `${range.from}_to_${range.to}`;

  const exports = [
    {
      label: "By month",
      run: () => downloadCsv(`pnl-by-month_${stamp}.csv`, ["Month", "Revenue", "Expenses", "Profit"], monthly.map((p) => [p.month, major(p.revenue), major(p.expenses), major(p.profit)])),
    },
    {
      label: "By project",
      run: () => downloadCsv(`pnl-by-project_${stamp}.csv`, ["Project", "Client", "Revenue", "Expenses", "Profit"], pnl.byProject.map((p) => [p.title, p.clientName, major(p.revenue), major(p.expenses), major(p.profit)])),
    },
    {
      label: "By client",
      run: () => downloadCsv(`pnl-by-client_${stamp}.csv`, ["Client", "Revenue", "Expenses", "Profit"], pnl.byClient.map((p) => [p.name, major(p.revenue), major(p.expenses), major(p.profit)])),
    },
    {
      label: "Expenses by category",
      run: () => downloadCsv(`expenses-by-category_${stamp}.csv`, ["Category", "Amount"], pnl.byCategory.map((p) => [p.name, major(p.amount)])),
    },
  ];

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {pnl.teamMonthlyCost > 0 ? (
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={includeTeam} onCheckedChange={(checked) => onIncludeTeam(checked === true)} className="mt-0.5" />
            <span>
              Include team salaries ({formatMoney(pnl.teamMonthlyCost, currency)} / month)
              <span className="block text-[13px] text-muted-foreground">An estimate from member costs. Leave off if you already log salaries as expenses.</span>
            </span>
          </label>
        ) : (
          <span />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download /> Export CSV
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {exports.map((item) => (
              <DropdownMenuItem key={item.label} onSelect={item.run}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatTile index={0} label="Revenue" value={totals.revenue} format={formatAmount} hint="Payments received" icon={HandCoins} />
        <StatTile index={1} label="Expenses" value={totals.expenses} format={formatAmount} hint={includeTeam ? "Including team salaries" : "General + project"} icon={Wallet} />
        <StatTile
          index={2}
          label={totals.profit >= 0 ? "Net profit" : "Net loss"}
          value={Math.abs(totals.profit)}
          format={formatAmount}
          tone={totals.profit >= 0 ? "positive" : "negative"}
          hint={totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}% margin` : "Revenue − expenses"}
          icon={totals.profit >= 0 ? TrendingUp : TrendingDown}
        />
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Revenue vs expenses" action={<ChartLegend series={REVENUE_EXPENSE_SERIES} />} index={0}>
          <RevenueExpensesChart data={monthly} currency={currency} />
        </Panel>
        <Panel title="By month" index={1}>
          <BreakdownTable
            caption="Profit and loss by month"
            firstColumn="Month"
            currency={currency}
            rows={monthly.map((point) => ({ key: point.month, label: monthLabel(point.month, "full"), revenue: point.revenue, expenses: point.expenses, profit: point.profit }))}
          />
        </Panel>
        <Panel title="By project" index={2}>
          <BreakdownTable
            caption="Profit and loss by project"
            firstColumn="Project"
            currency={currency}
            rows={pnl.byProject.map((row) => ({ key: row.projectId ?? "none", label: row.title, sub: row.clientName, revenue: row.revenue, expenses: row.expenses, profit: row.profit }))}
          />
        </Panel>
        <Panel title="By client" index={3}>
          <BreakdownTable
            caption="Profit and loss by client"
            firstColumn="Client"
            currency={currency}
            rows={pnl.byClient.map((row) => ({ key: row.clientId ?? "none", label: row.name, revenue: row.revenue, expenses: row.expenses, profit: row.profit }))}
          />
        </Panel>
        <Panel title="Expenses by category" index={4} className="xl:col-span-2">
          <RankedBars rows={pnl.byCategory.map((row) => ({ id: row.categoryId ?? "none", label: row.name, value: row.amount }))} format={formatAmount} emptyText="No expenses in this period." />
        </Panel>
      </div>
    </>
  );
}

export default function FinancePage() {
  const { workspace } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "expenses" ? "expenses" : "pnl";
  const [selection, setSelection] = useLocalStorage<RangeSelection>("aos-date-range", DEFAULT_RANGE);
  const range = resolveRange(selection);
  const [includeTeam, setIncludeTeam] = useLocalStorage("aos-pnl-include-team", false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");

  const pnl = usePnl(range);
  const expenses = useExpenses(range);
  const { data: categories = [] } = useExpenseCategories();
  const { data: projects = [] } = useProjects();

  const visibleExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (expenses.data ?? []).filter(
      (expense) =>
        (category === ALL || (category === "none" ? expense.categoryId === null : expense.categoryId === category)) &&
        (q === "" || `${expense.description} ${expense.vendor ?? ""} ${expense.projectTitle ?? ""}`.toLowerCase().includes(q)),
    );
  }, [expenses.data, category, query]);
  const visibleTotal = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const exportExpenses = () =>
    downloadCsv(
      `expenses_${range.from}_to_${range.to}.csv`,
      ["Date", "Description", "Category", "Project", "Paid to", "Amount"],
      visibleExpenses.map((e) => [e.date, e.description, e.categoryName, e.projectTitle, e.vendor, major(e.amount)]),
    );

  return (
    <>
      <PageHeader
        title="Finance"
        description="Income, expenses and profit at a glance."
        actions={
          <>
            <DateRangePicker value={selection} onChange={setSelection} />
            <Button onClick={() => setExpenseOpen(true)}>
              <Plus /> <span className="hidden sm:inline">Add expense</span>
              <span className="sm:hidden">Expense</span>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setParams(value === "pnl" ? {} : { tab: value }, { replace: true })}>
        <TabsList aria-label="Finance sections">
          <TabsTrigger value="pnl">Profit &amp; loss</TabsTrigger>
          <TabsTrigger value="expenses">
            Expenses
            {expenses.data && expenses.data.length > 0 && <span className="tabular rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{expenses.data.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          {pnl.isError ? (
            <ErrorState onRetry={() => void pnl.refetch()} />
          ) : !pnl.data ? (
            <div role="status" aria-label="Loading report">
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
              <Skeleton className="mt-6 h-80 rounded-2xl" />
            </div>
          ) : (
            <ProfitAndLossView pnl={pnl.data} range={range} includeTeam={includeTeam} onIncludeTeam={setIncludeTeam} />
          )}
        </TabsContent>

        <TabsContent value="expenses">
          {expenses.isError ? (
            <ErrorState onRetry={() => void expenses.refetch()} />
          ) : !expenses.data ? (
            <Skeleton className="h-72 rounded-2xl" role="status" aria-label="Loading expenses" />
          ) : expenses.data.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No expenses in this period"
              description="Log rent, software, salaries and project costs to see your real profit."
              action={
                <Button onClick={() => setExpenseOpen(true)}>
                  <Plus /> Add expense
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses…" aria-label="Search expenses" className="h-9 pl-9" />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 w-auto min-w-44" aria-label="Filter by category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">Uncategorised</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground sm:ml-auto">
                  {visibleExpenses.length} expense{visibleExpenses.length === 1 ? "" : "s"} · <span className="tabular font-semibold text-foreground">{formatMoney(visibleTotal, workspace.currency)}</span>
                </p>
                <Button variant="outline" size="sm" onClick={exportExpenses} disabled={visibleExpenses.length === 0}>
                  <Download /> CSV
                </Button>
              </div>
              {visibleExpenses.length === 0 ? (
                <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No expenses match these filters.</p>
              ) : (
                <ExpenseList expenses={visibleExpenses} projects={projects} />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} projects={projects} />
    </>
  );
}
