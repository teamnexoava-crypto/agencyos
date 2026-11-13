import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ExpenseInput } from "@shared/schemas/expense";
import type { DashboardData, ExpenseCategoryDTO, ExpenseDTO, ProfitAndLoss } from "@shared/types";
import { api } from "@/lib/api";

interface Range {
  from: string;
  to: string;
}

export const financeKeys = {
  dashboard: (range: Range) => ["dashboard", range] as const,
  pnl: (range: Range) => ["pnl", range] as const,
  expenses: (filter: Partial<Range> & { projectId?: string }) => ["expenses", "list", filter] as const,
  categories: ["expenses", "categories"] as const,
};

const query = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();

export function useDashboard(range: Range) {
  return useQuery({
    queryKey: financeKeys.dashboard(range),
    queryFn: async ({ signal }) => {
      const data = await api<DashboardData>(`/api/reports/dashboard?${query({ ...range })}`, { signal });
      // Stamp the fetch time so "3 hours ago" labels can be rendered without calling Date.now() in render.
      return { ...data, fetchedAt: Date.now() };
    },
    placeholderData: (previous) => previous, // keep the old figures on screen while a new range loads
  });
}

export function usePnl(range: Range) {
  return useQuery({
    queryKey: financeKeys.pnl(range),
    queryFn: ({ signal }) => api<ProfitAndLoss>(`/api/reports/pnl?${query({ ...range })}`, { signal }),
    placeholderData: (previous) => previous,
  });
}

export function useExpenses(filter: Partial<Range> & { projectId?: string }) {
  return useQuery({
    queryKey: financeKeys.expenses(filter),
    queryFn: async ({ signal }) => (await api<{ expenses: ExpenseDTO[] }>(`/api/expenses?${query(filter)}`, { signal })).expenses,
    placeholderData: (previous) => previous,
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: financeKeys.categories,
    queryFn: async ({ signal }) => (await api<{ categories: ExpenseCategoryDTO[] }>("/api/expenses/categories", { signal })).categories,
    staleTime: 5 * 60_000,
  });
}

/** Any change to expenses moves the dashboard, the P&L and the project's own numbers. */
function refreshFinance(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["expenses", "list"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["pnl"] });
  void queryClient.invalidateQueries({ queryKey: ["projects"] });
}

interface SaveExpenseVariables {
  id?: string;
  input: ExpenseInput;
  /** New receipt to attach after saving. */
  receipt?: File | null;
}

export function useSaveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input, receipt }: SaveExpenseVariables) => {
      let { expense } = await api<{ expense: ExpenseDTO }>(id ? `/api/expenses/${id}` : "/api/expenses", { method: id ? "PATCH" : "POST", json: input });
      if (receipt) {
        const form = new FormData();
        form.append("file", receipt);
        ({ expense } = await api<{ expense: ExpenseDTO }>(`/api/expenses/${expense.id}/receipt`, { method: "POST", form }));
      }
      return expense;
    },
    // Runs on error too: the expense itself may have been saved even if the receipt upload failed.
    onSettled: () => refreshFinance(queryClient),
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => refreshFinance(queryClient),
  });
}

export function useRemoveReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ expense: ExpenseDTO }>(`/api/expenses/${id}/receipt`, { method: "DELETE" }),
    onSuccess: () => refreshFinance(queryClient),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await api<{ category: ExpenseCategoryDTO }>("/api/expenses/categories", { method: "POST", json: { name } })).category,
    onSuccess: (category) => {
      queryClient.setQueryData<ExpenseCategoryDTO[]>(financeKeys.categories, (list) =>
        list && !list.some((item) => item.id === category.id) ? [...list, category].sort((a, b) => a.name.localeCompare(b.name)) : list,
      );
    },
  });
}
