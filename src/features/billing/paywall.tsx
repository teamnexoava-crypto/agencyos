import { UsersRound } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand";
import { UserMenu } from "@/components/layout/user-menu";
import { useSession } from "@/features/auth/api";

/**
 * The Free plan is for one person. When a workspace is on it, everyone but the owner sees this
 * instead of the app (the server refuses their requests too) until the owner upgrades. From here they
 * can switch to another workspace or sign out.
 */
export function SeatLock() {
  const { workspace } = useSession();
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
        <BrandLogo />
        <UserMenu />
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UsersRound className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{workspace.name} is on the Free plan</h1>
        <p className="mt-3 text-[15px] text-balance text-muted-foreground">
          The Free plan is for one person, so the team is paused for now. Ask the owner to upgrade – you'll get back in as soon as they do, and nothing has been deleted.
        </p>
      </main>
    </div>
  );
}
