import { useQuery } from "@tanstack/react-query";
import type { SetupProgress } from "@shared/types";
import { api } from "@/lib/api";

/** Which first steps the workspace has done – read fresh whenever the dashboard is opened. */
export function useSetupProgress(enabled: boolean) {
  return useQuery({
    queryKey: ["setup-progress"],
    queryFn: ({ signal }) => api<SetupProgress>("/api/workspace/setup-progress", { signal }),
    enabled,
    staleTime: 0,
  });
}
