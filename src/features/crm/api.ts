import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { LeadInput, LeadNoteInput, LeadSourceInput, LeadSourceUpdateInput, LeadUpdateInput } from "@shared/schemas/crm";
import type { LeadDTO, LeadDetail, LeadSourceDTO, SheetPreview, SyncResult } from "@shared/types";
import { api } from "@/lib/api";

export const crmKeys = {
  leads: ["crm", "leads"] as const,
  lead: (id: string) => ["crm", "lead", id] as const,
  sources: ["crm", "sources"] as const,
};

export function useLeads() {
  return useQuery({
    queryKey: crmKeys.leads,
    queryFn: async ({ signal }) => (await api<{ leads: LeadDTO[] }>("/api/crm/leads", { signal })).leads,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: crmKeys.lead(id),
    queryFn: async ({ signal }) => (await api<{ lead: LeadDetail }>(`/api/crm/leads/${id}`, { signal })).lead,
    enabled: id !== "",
  });
}

/** Puts a fresh lead into both caches: its own detail and its row in the list. */
function applyLead(queryClient: QueryClient, lead: LeadDetail) {
  queryClient.setQueryData(crmKeys.lead(lead.id), lead);
  queryClient.setQueryData<LeadDTO[]>(crmKeys.leads, (list) => {
    if (!list) return list;
    return list.some((item) => item.id === lead.id) ? list.map((item) => (item.id === lead.id ? lead : item)) : [lead, ...list];
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadInput) => (await api<{ lead: LeadDetail }>("/api/crm/leads", { method: "POST", json: input })).lead,
    onSuccess: (lead) => applyLead(queryClient, lead),
  });
}

/** Changes any fields of a lead. The list updates at once (dragging a card must not wait for the server). */
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: LeadUpdateInput }) => (await api<{ lead: LeadDetail }>(`/api/crm/leads/${id}`, { method: "PATCH", json: input })).lead,
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: crmKeys.leads });
      const previous = queryClient.getQueryData<LeadDTO[]>(crmKeys.leads);
      if (input.stage !== undefined || input.followUpDate !== undefined) {
        queryClient.setQueryData<LeadDTO[]>(crmKeys.leads, (list) =>
          list?.map((item) => (item.id === id ? { ...item, ...(input.stage !== undefined && { stage: input.stage }), ...(input.followUpDate !== undefined && { followUpDate: input.followUpDate || null }) } : item)),
        );
      }
      const previousLead = queryClient.getQueryData<LeadDetail>(crmKeys.lead(id));
      if (previousLead) {
        queryClient.setQueryData<LeadDetail>(crmKeys.lead(id), {
          ...previousLead,
          ...(input.stage !== undefined && { stage: input.stage }),
          ...(input.followUpDate !== undefined && { followUpDate: input.followUpDate || null }),
          ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId || null }),
        });
      }
      return { previous, previousLead };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) queryClient.setQueryData(crmKeys.leads, context.previous);
      if (context?.previousLead) queryClient.setQueryData(crmKeys.lead(id), context.previousLead);
    },
    onSuccess: (lead) => applyLead(queryClient, lead),
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/crm/leads/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<LeadDTO[]>(crmKeys.leads, (list) => list?.filter((item) => item.id !== id));
      queryClient.removeQueries({ queryKey: crmKeys.lead(id) });
    },
  });
}

export function useAddLeadNote(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadNoteInput) => (await api<{ lead: LeadDetail }>(`/api/crm/leads/${leadId}/notes`, { method: "POST", json: input })).lead,
    onSuccess: (lead) => applyLead(queryClient, lead),
  });
}

export function useDeleteLeadNote(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => (await api<{ lead: LeadDetail }>(`/api/crm/leads/${leadId}/notes/${noteId}`, { method: "DELETE" })).lead,
    onSuccess: (lead) => applyLead(queryClient, lead),
  });
}

export function useConvertLead(leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api<{ lead: LeadDetail }>(`/api/crm/leads/${leadId}/convert`, { method: "POST" })).lead,
    onSuccess: (lead) => {
      applyLead(queryClient, lead);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

/* ------------------------------------------------------------------------------------------------ Google Sheets */

export function useLeadSources(enabled = true) {
  return useQuery({
    queryKey: crmKeys.sources,
    queryFn: async ({ signal }) => (await api<{ sources: LeadSourceDTO[] }>("/api/crm/sources", { signal })).sources,
    enabled,
  });
}

export function usePreviewSheet() {
  return useMutation({
    mutationFn: async (url: string) => (await api<{ preview: SheetPreview }>("/api/crm/sources/preview", { method: "POST", json: { url } })).preview,
  });
}

function applySync(queryClient: QueryClient, result: SyncResult) {
  queryClient.setQueryData<LeadSourceDTO[]>(crmKeys.sources, (list) => {
    if (!list) return list;
    return list.some((item) => item.id === result.source.id) ? list.map((item) => (item.id === result.source.id ? result.source : item)) : [...list, result.source];
  });
  if (result.added > 0) void queryClient.invalidateQueries({ queryKey: crmKeys.leads });
}

export function useConnectSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadSourceInput) => api<SyncResult>("/api/crm/sources", { method: "POST", json: input }),
    onSuccess: (result) => applySync(queryClient, result),
  });
}

export function useSyncSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<SyncResult>(`/api/crm/sources/${id}/sync`, { method: "POST" }),
    onSuccess: (result) => applySync(queryClient, result),
    // A failed sync is recorded on the sheet (shown in the list), so refresh it.
    onError: () => void queryClient.invalidateQueries({ queryKey: crmKeys.sources }),
  });
}

export function useUpdateSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: LeadSourceUpdateInput }) => (await api<{ source: LeadSourceDTO }>(`/api/crm/sources/${id}`, { method: "PATCH", json: input })).source,
    onSuccess: (source) => queryClient.setQueryData<LeadSourceDTO[]>(crmKeys.sources, (list) => list?.map((item) => (item.id === source.id ? source : item))),
  });
}

export function useDisconnectSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/api/crm/sources/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => queryClient.setQueryData<LeadSourceDTO[]>(crmKeys.sources, (list) => list?.filter((item) => item.id !== id)),
  });
}
