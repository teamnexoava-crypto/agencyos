import { useCallback } from "react";
import { FolderKanban, HandCoins, ListChecks, ReceiptText, TrendingDown, TrendingUp, UsersRound, Wallet } from "lucide-react";
import { Link } from "react-router";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/api";
import { GetStarted } from "@/features/dashboard/get-started";
import { ActivityFeed, DeadlinesList, OverdueInvoices, Panel, StatTile } from "@/features/dashboard/panels";
import { useDashboard } from "@/features/finance/api";
import { ChartLegend, ProfitTrendChart, ProjectStatusDonut, RankedBars, RevenueExpensesChart } from "@/features/finance/charts";
import { PROFIT_SERIES, REVENUE_EXPENSE_SERIES } from "@/features/finance/series";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_RANGE, resolveRange, type RangeSelection } from "@/lib/date-range";
import { firstName, formatMoney, greeting } from "@/lib/format";

const formatCount = (value: number) => String(value);

function DashboardSkeleton({ tiles }: { tiles: number }) {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, workspace, canManage } = useSession();
  const [selection, setSelection] = useLocalStorage<RangeSelection>("aos-date-range", DEFAULT_RANGE);
  const range = resolveRange(selection);
  const { data, isPending, isError, refetch } = useDashboard(range);
  const formatAmount = useCallback((value: number) => formatMoney(value, workspace.currency), [workspace.currency]);

  const finance = data?.finance ?? null;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user.name)}`}
        description={canManage ? `Here's how ${workspace.name} is doing.` : `Here's what's on your plate at ${workspace.name}.`}
        // Filters live in one row above everything they control.
        actions={canManage ? <DateRangePicker value={selection} onChange={setSelection} /> : undefined}
      />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <DashboardSkeleton tiles={canManage ? 6 : 3} />
      ) : (
        <>
          {data.isEmpty && <GetStarted canManage={canManage} />}

          {finance ? (
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <StatTile index={0} label="Total revenue" value={finance.revenue} format={formatAmount} hint="Payments received" icon={HandCoins} />
              <StatTile index={1} label="Total expenses" value={finance.expenses} format={formatAmount} hint="General + project" icon={Wallet} />
              <StatTile
                index={2}
                label={finance.profit >= 0 ? "Net profit" : "Net loss"}
                value={Math.abs(finance.profit)}
                format={formatAmount}
                tone={finance.profit >= 0 ? "positive" : "negative"}
                hint={finance.revenue > 0 ? `${Math.round((finance.profit / finance.revenue) * 100)}% margin` : "Revenue − expenses"}
                icon={finance.profit >= 0 ? TrendingUp : TrendingDown}
              />
              <StatTile index={3} label="Outstanding" value={finance.outstanding} format={formatAmount} hint="Unpaid invoices, to date" icon={ReceiptText} />
              <StatTile index={4} label="Active projects" value={data.activeProjects} format={formatCount} hint="In progress" icon={FolderKanban} />
              <StatTile index={5} label="Team size" value={data.teamSize} format={formatCount} hint={data.teamSize === 1 ? "Just you" : "People"} icon={UsersRound} />
            </dl>
          ) : (
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <StatTile index={0} label="Active projects" value={data.activeProjects} format={formatCount} hint="You're assigned to" icon={FolderKanban} />
              <StatTile index={1} label="My open tasks" value={data.myOpenTasks} format={formatCount} hint="Across all projects" icon={ListChecks} />
              <StatTile index={2} label="Team size" value={data.teamSize} format={formatCount} hint="People" icon={UsersRound} />
            </dl>
          )}

          {finance && (
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <Panel title="Revenue vs expenses" action={<ChartLegend series={REVENUE_EXPENSE_SERIES} />} className="lg:col-span-2" index={0}>
                <RevenueExpensesChart data={finance.monthly} currency={workspace.currency} />
              </Panel>
              <Panel title="Profit trend" action={<ChartLegend series={PROFIT_SERIES} />} index={1}>
                <ProfitTrendChart data={finance.monthly} currency={workspace.currency} />
              </Panel>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Project status" index={2}>
              <ProjectStatusDonut counts={data.projectStatus} />
            </Panel>
            {finance && (
              <>
                <Panel title="Top clients by revenue" index={3}>
                  <RankedBars rows={finance.topClients.map((client) => ({ id: client.clientId, label: client.name, value: client.revenue }))} format={formatAmount} emptyText="No payments in this period yet." />
                </Panel>
                <Panel
                  title="Overdue invoices"
                  index={4}
                  action={
                    <Button asChild variant="link" size="sm" className="h-auto p-0">
                      <Link to="/app/invoices">All invoices</Link>
                    </Button>
                  }
                >
                  <OverdueInvoices items={finance.overdueInvoices} currency={workspace.currency} />
                </Panel>
              </>
            )}
            <Panel title="Upcoming deadlines" index={5} className={finance ? "lg:col-span-2" : "lg:col-span-2"}>
              <DeadlinesList items={data.deadlines} />
            </Panel>
            <Panel title="Recent activity" index={6} className={finance ? "" : "lg:col-span-3"}>
              <ActivityFeed items={data.activity} now={data.fetchedAt} />
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
