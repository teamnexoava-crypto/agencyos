import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Sample data touches every screen, so everything is fetched again afterwards. */
function useRefreshEverything() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function useAddSampleData() {
  const refresh = useRefreshEverything();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/workspace/sample-data", { method: "POST" }),
    onSuccess: refresh,
  });
}

export function useRemoveSampleData() {
  const refresh = useRefreshEverything();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/workspace/sample-data", { method: "DELETE" }),
    onSuccess: refresh,
  });
}
