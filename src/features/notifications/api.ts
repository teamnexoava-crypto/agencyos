import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationFeed } from "@shared/types";
import { api } from "@/lib/api";

const key = ["notifications"] as const;

/** The bell's feed. Refreshed every minute while the tab is visible, and whenever the tab regains focus. */
export function useNotifications() {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<NotificationFeed>("/api/notifications", { signal }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
}

/** Marks some (or, with no ids, all) notifications as read – instantly in the UI, then on the server. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api<{ ok: true }>("/api/notifications/read", { method: "POST", json: ids ? { ids } : {} }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationFeed>(key);
      if (previous) {
        const notifications = previous.notifications.map((item) => (!ids || ids.includes(item.id) ? { ...item, read: true } : item));
        const cleared = previous.notifications.filter((item) => !item.read && (!ids || ids.includes(item.id))).length;
        queryClient.setQueryData<NotificationFeed>(key, { notifications, unread: ids ? Math.max(0, previous.unread - cleared) : 0 });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
