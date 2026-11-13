import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateWorkspaceInput, OnboardingInput } from "@shared/schemas/workspace";
import type { MeResponse, WorkspaceDTO } from "@shared/types";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingInput) =>
      api<{ workspace: WorkspaceDTO }>("/api/workspace/onboarding", { method: "POST", json: input }),
    onSuccess: ({ workspace }) => {
      // Write the result straight into the session cache so the route guard lets us into /app immediately.
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) => (me ? { ...me, workspace } : me));
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<{ logoUrl: string }>("/api/workspace/logo", { method: "POST", form });
    },
    onSuccess: ({ logoUrl }) => {
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) =>
        me?.workspace ? { ...me, workspace: { ...me.workspace, logoUrl } } : me,
      );
    },
  });
}

export function useRemoveLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/api/workspace/logo", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.setQueryData<MeResponse | null>(queryKeys.me, (me) =>
        me?.workspace ? { ...me, workspace: { ...me.workspace, logoUrl: null } } : me,
      );
    },
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => api<{ ok: true }>("/api/workspace", { method: "POST", json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
