import { and, eq, gte, inArray, isNull, lte, sql, sum } from "drizzle-orm";
import type { DateRange } from "../../shared/schemas/expense";
import type { MonthlyPoint, ProjectFinance } from "../../shared/types";
import { expenses, invoices, payments } from "../db/schema";
import type { Tenant } from "../lib/tenant";

/** Every calendar month touched by the range, as YYYY-MM, oldest first. */
export function monthsInRange(range: DateRange): string[] {
  const months: string[] = [];
  let year = Number(range.from.slice(0, 4));
  let month = Number(range.from.slice(5, 7));
  const last = range.to.slice(0, 7);
  for (let guard = 0; guard < 120; guard++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push(key);
    if (key >= last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Revenue is cash received (payment date), expenses are by expense date – so a month's profit is
 * simply money in minus money out for that month.
 */
export async function monthlySeries(t: Tenant, range: DateRange): Promise<MonthlyPoint[]> {
  const paymentMonth = sql<string>`to_char(${payments.date}, 'YYYY-MM')`;
  const expenseMonth = sql<string>`to_char(${expenses.date}, 'YYYY-MM')`;
  const [revenueRows, expenseRows] = await Promise.all([
    t.db
      .select({ month: paymentMonth, total: sum(payments.amount).mapWith(Number) })
      .from(payments)
      .where(t.where(payments, gte(payments.date, range.from), lte(payments.date, range.to)))
      .groupBy(paymentMonth),
    t.db
      .select({ month: expenseMonth, total: sum(expenses.amount).mapWith(Number) })
      .from(expenses)
      .where(t.where(expenses, isNull(expenses.deletedAt), gte(expenses.date, range.from), lte(expenses.date, range.to)))
      .groupBy(expenseMonth),
  ]);
  const revenue = new Map(revenueRows.map((row) => [row.month, row.total ?? 0]));
  const spent = new Map(expenseRows.map((row) => [row.month, row.total ?? 0]));
  return monthsInRange(range).map((month) => {
    const r = revenue.get(month) ?? 0;
    const e = spent.get(month) ?? 0;
    return { month, revenue: r, expenses: e, profit: r - e };
  });
}

/** Unpaid balance on invoices that have been sent, as of now. */
export async function outstandingBalance(t: Tenant): Promise<number> {
  const [row] = await t.db
    .select({ total: sum(sql<number>`${invoices.total} - ${invoices.amountPaid}`).mapWith(Number) })
    .from(invoices)
    .where(t.where(invoices, isNull(invoices.deletedAt), inArray(invoices.status, ["sent", "viewed", "partially_paid"])));
  return row?.total ?? 0;
}

/** All-time money summary for one project. */
export async function projectFinance(t: Tenant, projectId: string): Promise<ProjectFinance> {
  const [invoiceRows, expenseRows] = await Promise.all([
    t.db
      .select({ invoiced: sum(invoices.total).mapWith(Number), received: sum(invoices.amountPaid).mapWith(Number) })
      .from(invoices)
      .where(t.where(invoices, eq(invoices.projectId, projectId), isNull(invoices.deletedAt), inArray(invoices.status, ["sent", "viewed", "partially_paid", "paid"]))),
    t.db
      .select({ total: sum(expenses.amount).mapWith(Number) })
      .from(expenses)
      .where(t.where(expenses, and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))),
  ]);
  const invoiced = invoiceRows[0]?.invoiced ?? 0;
  const received = invoiceRows[0]?.received ?? 0;
  const spent = expenseRows[0]?.total ?? 0;
  return { invoiced, received, expenses: spent, profit: received - spent };
}
