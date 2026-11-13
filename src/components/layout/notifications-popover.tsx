import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Notification centre. The feed (invoice viewed/paid, contract signed, task assigned) is wired up in
 * Phase 8; until then this shows the "all caught up" state.
 */
export function NotificationsPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="text-muted-foreground hover:text-foreground">
          <Bell className="size-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
        </div>
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BellRing className="size-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="text-[13px] text-muted-foreground">
              We'll let you know when a client views an invoice, pays, or signs a contract.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
