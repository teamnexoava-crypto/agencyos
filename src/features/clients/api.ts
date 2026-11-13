import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientInput } from "@shared/schemas/client";
import type { ClientDTO, ClientDetail } from "@shared/types";
import { api } from "@/lib/api";

export const clientKeys = {
  all: ["clients"] as const,
  detail: (id: string) => ["clients", id] as const,
};

export function useClients(enabled = true) {
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: async ({ signal }) => (await api<{ clients: ClientDTO[] }>("/api/clients", { signal })).clients,
    enabled,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async ({ signal }) => (await api<{ client: ClientDetail }>(`/api/clients/${id}`, { signal })).client,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => (await api<{ client: ClientDTO }>("/api/clients", { method: "POST", json: input })).client,
    onSuccess: (client) => {
      queryClient.setQueryData<ClientDTO[]>(clientKeys.all, (list) =>
        list ? [...list, client].sort((a, b) => a.name.localeCompare(b.name)) : list,
      );
    },
  });
}

export function useUpdateClient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => (await api<{ client: ClientDTO }>(`/api/clients/${id}`, { method: "PATCH", json: input })).client,
    onSuccess: (client) => {
      queryClient.setQueryData<ClientDTO[]>(clientKeys.all, (list) => list?.map((item) => (item.id === id ? client : item)));
      queryClient.setQueryData<ClientDetail>(clientKeys.detail(id), (detail) => (detail ? { ...detail, ...client } : detail));
      // Project cards show the client's name.
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/clients/${id}`, { method: "DELETE" }),
    // Optimistic: the row disappears immediately and is restored if the request fails.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: clientKeys.all });
      const previous = queryClient.getQueryData<ClientDTO[]>(clientKeys.all);
      queryClient.setQueryData<ClientDTO[]>(clientKeys.all, (list) => list?.filter((item) => item.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(clientKeys.all, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
