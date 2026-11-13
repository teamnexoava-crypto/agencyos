import { useState } from "react";
import { Bell, BellRing, CheckCheck, CircleDollarSign, Eye, FileSignature, ListChecks, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import type { NotificationType } from "@shared/constants";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMarkNotificationsRead, useNotifications } from "@/features/notifications/api";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<NotificationType, { icon: LucideIcon; tone: string }>> = {
  "invoice.viewed": { icon: Eye, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  "invoice.paid": { icon: CircleDollarSign, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" },
  "contract.viewed": { icon: Eye, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300" },
  "contract.signed": { icon: FileSignature, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" },
  "task.assigned": { icon: ListChecks, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300" },
  "comment.created": { icon: MessageSquare, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-300" },
};
const FALLBACK = { icon: UserPlus, tone: "bg-primary/10 text-primary" };

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

/** Notification centre: invoice viewed / paid, contract opened / signed, task assigned, client messages. */
export function NotificationsPopover() {
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const items = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative text-muted-foreground hover:text-foreground">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span aria-hidden="true" className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={() => markRead.mutate(undefined)}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BellRing className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-[13px] text-muted-foreground">We'll let you know when a client views an invoice, pays, signs a contract or sends a message.</p>
            </div>
          </div>
        ) : (
          <ul className="max-h-[min(26rem,70dvh)] divide-y overflow-y-auto">
            {items.map((item) => {
              const { icon: Icon, tone } = ICONS[item.type] ?? FALLBACK;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!item.read) markRead.mutate([item.id]);
                      if (item.link) {
                        setOpen(false);
                        void navigate(item.link);
                      }
                    }}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50", !item.read && "bg-primary/[0.04]")}
                  >
                    <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", item.read ? "text-foreground/85" : "font-medium")}>{item.title}</span>
                      {item.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{item.body}</span>}
                      <span className="mt-1 block text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
                    </span>
                    {!item.read && (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
