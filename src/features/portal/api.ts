import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PortalCommentInput, ShareLinkInput } from "@shared/schemas/portal";
import type { CommentDTO, MeResponse, PortalData, ProjectFileDTO, ShareLinkDTO } from "@shared/types";
import { api, setCsrfToken } from "@/lib/api";

export const portalKeys = {
  files: (projectId: string) => ["projects", projectId, "files"] as const,
  share: (projectId: string) => ["projects", projectId, "share"] as const,
  comments: (projectId: string) => ["projects", projectId, "comments"] as const,
  public: (token: string) => ["public-portal", token] as const,
};

/* ------------------------------------------------------------------------------------------------ project files */

export function useProjectFiles(projectId: string) {
  return useQuery({
    queryKey: portalKeys.files(projectId),
    queryFn: async ({ signal }) => (await api<{ files: ProjectFileDTO[] }>(`/api/projects/${projectId}/files`, { signal })).files,
  });
}

export function useUploadFile(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api<{ file: ProjectFileDTO }>(`/api/projects/${projectId}/files`, { method: "POST", form })).file;
    },
    onSuccess: (file) => queryClient.setQueryData<ProjectFileDTO[]>(portalKeys.files(projectId), (current = []) => [file, ...current]),
  });
}

/** Show / hide a file on the client portal. Flips instantly and rolls back if the server refuses. */
export function useSetFileShared(projectId: string) {
  const queryClient = useQueryClient();
  const key = portalKeys.files(projectId);
  return useMutation({
    mutationFn: ({ fileId, shared }: { fileId: string; shared: boolean }) =>
      api<{ file: ProjectFileDTO }>(`/api/projects/${projectId}/files/${fileId}`, { method: "PATCH", json: { sharedWithClient: shared } }),
    onMutate: async ({ fileId, shared }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectFileDTO[]>(key);
      queryClient.setQueryData<ProjectFileDTO[]>(key, (current = []) => current.map((file) => (file.id === fileId ? { ...file, sharedWithClient: shared } : file)));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteFile(projectId: string) {
  const queryClient = useQueryClient();
  const key = portalKeys.files(projectId);
  return useMutation({
    mutationFn: (fileId: string) => api<{ ok: true }>(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE" }),
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProjectFileDTO[]>(key);
      queryClient.setQueryData<ProjectFileDTO[]>(key, (current = []) => current.filter((file) => file.id !== fileId));
      return { previous };
    },
    onError: (_error, _fileId, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

/* ------------------------------------------------------------------------------------------------ client link */

export function useShareLink(projectId: string) {
  return useQuery({
    queryKey: portalKeys.share(projectId),
    queryFn: async ({ signal }) => (await api<{ link: ShareLinkDTO | null }>(`/api/projects/${projectId}/share`, { signal })).link,
  });
}

export function useSaveShareLink(projectId: string) {
  const queryClient = useQueryClient();
  const key = portalKeys.share(projectId);
  return useMutation({
    mutationFn: async (input: ShareLinkInput) => (await api<{ link: ShareLinkDTO }>(`/api/projects/${projectId}/share`, { method: "PUT", json: input })).link,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShareLinkDTO | null>(key);
      if (previous) queryClient.setQueryData<ShareLinkDTO | null>(key, { ...previous, ...input });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (link) => queryClient.setQueryData(key, link),
  });
}

export function useRegenerateShareLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api<{ link: ShareLinkDTO }>(`/api/projects/${projectId}/share/regenerate`, { method: "POST" })).link,
    onSuccess: (link) => queryClient.setQueryData(portalKeys.share(projectId), link),
  });
}

/* ------------------------------------------------------------------------------------------------ messages */

export function useProjectComments(projectId: string) {
  return useQuery({
    queryKey: portalKeys.comments(projectId),
    queryFn: async ({ signal }) => (await api<{ comments: CommentDTO[] }>(`/api/projects/${projectId}/comments`, { signal })).comments,
  });
}

export function usePostComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => (await api<{ comment: CommentDTO }>(`/api/projects/${projectId}/comments`, { method: "POST", json: { body } })).comment,
    onSuccess: (comment) => queryClient.setQueryData<CommentDTO[]>(portalKeys.comments(projectId), (current = []) => [...current, comment]),
  });
}

export function useDeleteComment(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api<{ ok: true }>(`/api/projects/${projectId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: (_data, commentId) => queryClient.setQueryData<CommentDTO[]>(portalKeys.comments(projectId), (current = []) => current.filter((comment) => comment.id !== commentId)),
  });
}

/* ------------------------------------------------------------------------------------------------ public portal */

/** Links already loaded once in this tab: later background refreshes must not count as new visits. */
const visited = new Set<string>();

export function usePortal(token: string) {
  return useQuery({
    queryKey: portalKeys.public(token),
    queryFn: async ({ signal }) => {
      const refresh = visited.has(token);
      const { portal } = await api<{ portal: PortalData }>(`/api/public/portal/${token}${refresh ? "?refresh=1" : ""}`, { signal });
      visited.add(token);
      return portal;
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function usePortalComment(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PortalCommentInput) => {
      // Someone from the agency previewing their own link is signed in, so the request needs their CSRF token.
      const me = await api<MeResponse | null>("/api/auth/me").catch(() => null);
      if (me) setCsrfToken(me.csrfToken);
      return (await api<{ comment: CommentDTO }>(`/api/public/portal/${token}/comments`, { method: "POST", json: input })).comment;
    },
    onSuccess: (comment) =>
      queryClient.setQueryData<PortalData>(portalKeys.public(token), (current) => (current ? { ...current, comments: [...(current.comments ?? []), comment] } : current)),
  });
}

export const portalUrl = (token: string) => `${window.location.origin}/p/${token}`;
export const portalFileUrl = (token: string, fileId: string) => `/api/public/portal/${token}/files/${fileId}`;
