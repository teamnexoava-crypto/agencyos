import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AgencySignInput, ClientSignInput, ContractCreateInput, ContractTemplateInput, ContractUpdateInput } from "@shared/schemas/contract";
import type { ContractDetail, ContractDocument, ContractListItem, ContractTemplateDTO, MeResponse } from "@shared/types";
import { api, setCsrfToken } from "@/lib/api";

export const contractKeys = {
  all: ["contracts"] as const,
  list: (filter: { clientId?: string; projectId?: string } = {}) => ["contracts", "list", filter] as const,
  detail: (id: string) => ["contracts", "detail", id] as const,
  templates: ["contracts", "templates"] as const,
  public: (token: string) => ["public-contract", token] as const,
};

export function useContracts(filter: { clientId?: string; projectId?: string } = {}) {
  return useQuery({
    queryKey: contractKeys.list(filter),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(Object.entries(filter).filter((entry): entry is [string, string] => Boolean(entry[1])));
      const query = params.toString();
      return (await api<{ contracts: ContractListItem[] }>(`/api/contracts${query ? `?${query}` : ""}`, { signal })).contracts;
    },
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.detail(id),
    queryFn: async ({ signal }) => (await api<{ contract: ContractDetail }>(`/api/contracts/${id}`, { signal })).contract,
  });
}

function applyContract(queryClient: QueryClient, contract: ContractDetail) {
  queryClient.setQueryData(contractKeys.detail(contract.id), contract);
  void queryClient.invalidateQueries({ queryKey: ["contracts", "list"] });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContractCreateInput) => (await api<{ contract: ContractDetail }>("/api/contracts", { method: "POST", json: input })).contract,
    onSuccess: (contract) => applyContract(queryClient, contract),
  });
}

export function useUpdateContract(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContractUpdateInput) => (await api<{ contract: ContractDetail }>(`/api/contracts/${id}`, { method: "PUT", json: input })).contract,
    onSuccess: (contract) => applyContract(queryClient, contract),
  });
}

export type ContractAction = "send" | "unsend" | "void" | "link" | "version";

/** Send for signature, pull back to draft, void, issue a new link, or start a new version. */
export function useContractAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: ContractAction) => (await api<{ contract: ContractDetail }>(`/api/contracts/${id}/${action}`, { method: "POST" })).contract,
    onSuccess: (contract) => {
      applyContract(queryClient, contract);
      // "version" returns the NEW contract; the one we acted on has changed too.
      if (contract.id !== id) void queryClient.invalidateQueries({ queryKey: contractKeys.detail(id) });
    },
  });
}

export function useCounterSign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgencySignInput) => (await api<{ contract: ContractDetail }>(`/api/contracts/${id}/sign`, { method: "POST", json: input })).contract,
    onSuccess: (contract) => applyContract(queryClient, contract),
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/contracts/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: contractKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ["contracts", "list"] });
    },
  });
}

/* ------------------------------------------------------------------------------------------------ templates */

export function useContractTemplates(enabled = true) {
  return useQuery({
    queryKey: contractKeys.templates,
    queryFn: async ({ signal }) => (await api<{ templates: ContractTemplateDTO[] }>("/api/contracts/templates", { signal })).templates,
    enabled,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ContractTemplateInput }) =>
      (await api<{ template: ContractTemplateDTO }>(id ? `/api/contracts/templates/${id}` : "/api/contracts/templates", { method: id ? "PUT" : "POST", json: input })).template,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contractKeys.templates }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/contracts/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contractKeys.templates }),
  });
}

/* ------------------------------------------------------------------------------------------------ public page */

/** The login-free signing page. Opening it is what marks the contract as "viewed". */
export function usePublicContract(token: string) {
  return useQuery({
    queryKey: contractKeys.public(token),
    queryFn: async ({ signal }) => (await api<{ contract: ContractDocument }>(`/api/public/contracts/${token}`, { signal })).contract,
    retry: false,
    staleTime: 60_000,
  });
}

export function useClientSign(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientSignInput) => {
      // Someone from the agency trying their own link is signed in, so the request needs their CSRF token.
      const me = await api<MeResponse | null>("/api/auth/me").catch(() => null);
      if (me) setCsrfToken(me.csrfToken);
      return (await api<{ contract: ContractDocument }>(`/api/public/contracts/${token}/sign`, { method: "POST", json: input })).contract;
    },
    onSuccess: (contract) => queryClient.setQueryData(contractKeys.public(token), contract),
  });
}
