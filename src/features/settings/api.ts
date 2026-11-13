import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SettingsInvoicingInput, SettingsMessagesInput, SettingsProfileInput } from "@shared/schemas/settings";
import type { MeResponse, WorkspaceDTO, WorkspaceSettings } from "@shared/types";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

const key = ["workspace", "settings"] as const;

export function useSettings() {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await api<{ settings: WorkspaceSettings }>("/api/workspace/settings", { signal })).settings,
  });
}

type Section = { section: "profile"; input: SettingsProfileInput } | { section: "invoicing"; input: SettingsInvoicingInput } | { section: "messages"; input: SettingsMessagesInput };

/** Saves one section of the settings and refreshes everything that shows the workspace (sidebar, invoices, defaults). */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ section, input }: Section) => api<{ settings: WorkspaceSettings; workspace: WorkspaceDTO }>(`/api/workspace/settings/${section}`, { method: "PUT", json: input }),
    onSuccess: ({ settings, workspace }) => {
      queryClient.setQueryData(key, settings);
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) => (me ? { ...me, workspace } : me));
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["contracts"] });
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });
}

export function useDeleteWorkspace() {
  return useMutation({
    mutationFn: (confirmName: string) => api<{ ok: true }>("/api/workspace", { method: "DELETE", json: { confirmName } }),
  });
}
