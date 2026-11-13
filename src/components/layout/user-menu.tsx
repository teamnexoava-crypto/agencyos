import { Check, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceLogo } from "@/components/shared/workspace-logo";
import { useLogout, useSession } from "@/features/auth/api";
import { useMemberships, useSwitchWorkspace } from "@/features/team/api";
import { errorMessage } from "@/lib/api";
import { initials } from "@/lib/format";

export function UserMenu() {
  const { user, role, canManage } = useSession();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const { data: memberships = [] } = useMemberships();
  const switchWorkspace = useSwitchWorkspace();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="rounded-full ring-offset-background transition-shadow hover:ring-4 hover:ring-ring/20 data-[state=open]:ring-4 data-[state=open]:ring-ring/30"
      >
        <Avatar className="size-9">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar className="size-10">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary" className="capitalize">
            {role}
          </Badge>
        </div>

        {/* Only people who belong to more than one workspace need a switcher. */}
        {memberships.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {memberships.map((item) => (
              <DropdownMenuItem
                key={item.workspaceId}
                disabled={switchWorkspace.isPending}
                onSelect={(event) => {
                  if (item.active) return;
                  event.preventDefault();
                  switchWorkspace.mutate(item.workspaceId, { onError: (error) => toast.error(errorMessage(error, "Could not switch workspace.")) });
                }}
              >
                <WorkspaceLogo name={item.name} logoUrl={item.logoUrl} className="size-6 rounded-md text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.active ? <Check className="!text-primary" /> : <span className="text-xs text-muted-foreground capitalize">{item.role}</span>}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        {canManage && (
          <DropdownMenuItem asChild>
            <Link to="/app/settings">
              <Settings /> Workspace settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={logout.isPending}
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate(undefined, { onError: (error) => toast.error(errorMessage(error, "Could not sign you out.")) });
          }}
        >
          <LogOut /> {logout.isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
