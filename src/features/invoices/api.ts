import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { InvoiceInput, PaymentInput } from "@shared/schemas/invoice";
import type { InvoiceDefaults, InvoiceDetail, InvoiceDocument, InvoiceListItem } from "@shared/types";
import { api } from "@/lib/api";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (filter: { clientId?: string; projectId?: string } = {}) => ["invoices", "list", filter] as const,
  detail: (id: string) => ["invoices", "detail", id] as const,
  defaults: ["invoices", "defaults"] as const,
  public: (token: string) => ["public-invoice", token] as const,
};

interface InvoiceListResponse {
  invoices: InvoiceListItem[];
  collectedThisMonth: number;
}

export function useInvoices(filter: { clientId?: string; projectId?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.list(filter),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams(Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])));
      const query = params.toString();
      return api<InvoiceListResponse>(`/api/invoices${query ? `?${query}` : ""}`, { signal });
    },
    enabled,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: async ({ signal }) => (await api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`, { signal })).invoice,
  });
}

export function useInvoiceDefaults() {
  return useQuery({
    queryKey: invoiceKeys.defaults,
    queryFn: async ({ signal }) => (await api<{ defaults: InvoiceDefaults }>("/api/invoices/defaults", { signal })).defaults,
    staleTime: 0, // the next number changes every time an invoice is created
  });
}

/** Stores the fresh invoice and refreshes every list / total that could have changed with it. */
function applyInvoice(queryClient: QueryClient, invoice: InvoiceDetail) {
  queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
  void queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
  void queryClient.invalidateQueries({ queryKey: invoiceKeys.defaults });
  void queryClient.invalidateQueries({ queryKey: ["clients"] });
}

export function useSaveInvoice(id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvoiceInput) =>
      (await api<{ invoice: InvoiceDetail }>(id ? `/api/invoices/${id}` : "/api/invoices", { method: id ? "PUT" : "POST", json: input })).invoice,
    onSuccess: (invoice) => applyInvoice(queryClient, invoice),
  });
}

type InvoiceAction = "send" | "cancel" | "link";

/** Mark as sent, cancel, or issue a new public link. */
export function useInvoiceAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: InvoiceAction) => (await api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}/${action}`, { method: "POST" })).invoice,
    onSuccess: (invoice) => applyInvoice(queryClient, invoice),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/invoices/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: invoiceKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
    },
  });
}

export function useRecordPayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInput) => (await api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}/payments`, { method: "POST", json: input })).invoice,
    onSuccess: (invoice) => applyInvoice(queryClient, invoice),
  });
}

export function useDeletePayment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => (await api<{ invoice: InvoiceDetail }>(`/api/invoices/${id}/payments/${paymentId}`, { method: "DELETE" })).invoice,
    onSuccess: (invoice) => applyInvoice(queryClient, invoice),
  });
}

/** The login-free invoice page. Opening it is what marks the invoice as "viewed". */
export function usePublicInvoice(token: string) {
  return useQuery({
    queryKey: invoiceKeys.public(token),
    queryFn: async ({ signal }) => (await api<{ invoice: InvoiceDocument }>(`/api/public/invoices/${token}`, { signal })).invoice,
    retry: false,
    staleTime: 60_000,
  });
}
