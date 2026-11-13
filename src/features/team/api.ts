import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteInput, MemberUpdateInput } from "@shared/schemas/team";
import type { InviteDTO, InvitePreview, MemberDetail, TeamMemberDTO, TeamResponse, WorkspaceMembershipDTO } from "@shared/types";
import { memberKeys } from "@/features/members/api";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

export const teamKeys = {
  all: ["team"] as const,
  member: (id: string) => ["team", id] as const,
  invite: (token: string) => ["invite", token] as const,
  memberships: ["memberships"] as const,
};

/** An invite plus how long it has left, worked out when the data was fetched (keeps rendering pure). */
export type PendingInvite = InviteDTO & { daysLeft: number };
export type TeamData = Omit<TeamResponse, "invites"> & { invites: PendingInvite[] };

export function useTeam() {
  return useQuery({
    queryKey: teamKeys.all,
    queryFn: async ({ signal }): Promise<TeamData> => {
      const team = await api<TeamResponse>("/api/team", { signal });
      const now = Date.now();
      return { ...team, invites: team.invites.map((invite) => ({ ...invite, daysLeft: Math.max(0, Math.ceil((invite.expiresAt - now) / 86_400_000)) })) };
    },
  });
}

export function useMemberDetail(memberId: string) {
  return useQuery({ queryKey: teamKeys.member(memberId), queryFn: ({ signal }) => api<MemberDetail>(`/api/team/${memberId}`, { signal }) });
}

export function useUpdateMember(memberId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MemberUpdateInput) => (await api<{ member: TeamMemberDTO }>(`/api/team/${memberId}`, { method: "PATCH", json: input })).member,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      // Changing your own role changes what you're allowed to see.
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api<{ ok: true }>(`/api/team/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamKeys.all });
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteInput) => (await api<{ invite: InviteDTO }>("/api/team/invites", { method: "POST", json: input })).invite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api<{ ok: true }>(`/api/team/invites/${inviteId}`, { method: "DELETE" }),
    onMutate: async (inviteId) => {
      await queryClient.cancelQueries({ queryKey: teamKeys.all, exact: true });
      const previous = queryClient.getQueryData<TeamData>(teamKeys.all);
      queryClient.setQueryData<TeamData>(teamKeys.all, (team) => (team ? { ...team, invites: team.invites.filter((invite) => invite.id !== inviteId) } : team));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(teamKeys.all, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: teamKeys.all, exact: true }),
  });
}

/* ------------------------------------------------------------------------------------------------ invite links */

export function useInvitePreview(token: string) {
  return useQuery({ queryKey: teamKeys.invite(token), queryFn: ({ signal }) => api<InvitePreview>(`/api/invites/${token}`, { signal }), staleTime: 0 });
}

export function useAcceptInvite(token: string) {
  return useMutation({ mutationFn: () => api<{ ok: true; workspaceId: string }>(`/api/invites/${token}/accept`, { method: "POST" }) });
}

/* ------------------------------------------------------------------------------------------------ workspaces */

export function useMemberships() {
  return useQuery({
    queryKey: teamKeys.memberships,
    queryFn: async ({ signal }) => (await api<{ memberships: WorkspaceMembershipDTO[] }>("/api/workspace/memberships", { signal })).memberships,
    staleTime: 5 * 60_000,
  });
}

export function useSwitchWorkspace() {
  return useMutation({
    mutationFn: (workspaceId: string) => api<{ ok: true }>("/api/workspace/switch", { method: "POST", json: { workspaceId } }),
    // Everything cached belongs to the old workspace – a full load is the simplest guarantee none of it leaks across.
    onSuccess: () => window.location.assign("/app"),
  });
}
