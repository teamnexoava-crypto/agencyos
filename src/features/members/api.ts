import { useQuery } from "@tanstack/react-query";
import type { MemberSummary } from "@shared/types";
import { api } from "@/lib/api";

export const memberKeys = { all: ["members"] as const };

/** Everyone in the workspace – used for assignee pickers and avatars. */
export function useMembers() {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: async ({ signal }) => (await api<{ members: MemberSummary[] }>("/api/members", { signal })).members,
    staleTime: 5 * 60_000,
  });
}

/** id → member lookup that is stable enough to pass around in render. */
export function useMemberMap(): Map<string, MemberSummary> {
  const { data } = useMembers();
  return new Map((data ?? []).map((member) => [member.id, member]));
}
