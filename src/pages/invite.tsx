import { motion } from "motion/react";
import { CircleAlert, LoaderCircle, LogOut, MailCheck, TimerOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { BrandLogo, GoogleIcon } from "@/components/shared/brand";
import { WorkspaceLogo } from "@/components/shared/workspace-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useMe } from "@/features/auth/api";
import { useAcceptInvite, useInvitePreview } from "@/features/team/api";
import { ApiError, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

const DEAD_INVITE: Record<string, { title: string; body: string }> = {
  expired: { title: "This invite has expired", body: "Invite links work for 7 days. Ask the person who invited you to send a new one." },
  revoked: { title: "This invite was cancelled", body: "Ask the person who invited you to send a new one." },
  accepted: { title: "This invite has already been used", body: "If that was you, just sign in to open the workspace." },
  not_found: { title: "Invite not found", body: "Check that you opened the full link, or ask for a new invite." },
};

/** Public page behind an invite link: shows who invited you, then joins the workspace after Google sign-in. */
export default function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: invite, isPending, isError, refetch } = useInvitePreview(token);
  const { data: me, isPending: mePending } = useMe();
  const accept = useAcceptInvite(token);
  const logout = useLogout();

  const mismatch = Boolean(me && invite?.email && me.user.email.toLowerCase() !== invite.email.toLowerCase());
  const googleHref = `/api/auth/google?next=${encodeURIComponent(`/invite/${token}`)}`;

  const join = () =>
    accept.mutate(undefined, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.me });
        toast.success(`Welcome to ${invite?.workspaceName ?? "the team"}!`);
        void navigate("/app", { replace: true });
      },
      onError: (error) => {
        toast.error(errorMessage(error, "Could not accept the invite."));
        if (error instanceof ApiError && error.status === 410) void refetch();
      },
    });

  let body;
  if (isPending || mePending) {
    body = (
      <div className="flex flex-col items-center gap-4" role="status" aria-label="Loading invite">
        <Skeleton className="size-16 rounded-2xl" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-2 h-11 w-full" />
      </div>
    );
  } else if (isError || !invite) {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <h1 className="text-xl font-semibold tracking-tight">Couldn't load this invite</h1>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (invite.state !== "valid") {
    const dead = DEAD_INVITE[invite.state] ?? DEAD_INVITE.not_found;
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <TimerOff className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{dead?.title}</h1>
        <p className="text-sm text-muted-foreground">{dead?.body}</p>
        <Button asChild variant="outline" className="mt-2">
          <Link to={me ? "/app" : "/login"}>{me ? "Open AgencyOS" : "Sign in"}</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col items-center text-center">
        <WorkspaceLogo name={invite.workspaceName ?? "Workspace"} logoUrl={invite.workspaceLogoUrl} className="size-16 rounded-2xl text-lg" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance">Join {invite.workspaceName}</h1>
        <p className="mt-2 text-sm text-balance text-muted-foreground">
          {invite.inviterName ? <span className="font-medium text-foreground">{invite.inviterName}</span> : "Someone"} invited you to their workspace on AgencyOS as{" "}
          {invite.role === "admin" ? "an admin" : "a member"}.
        </p>

        <div className="mt-6 flex w-full items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-left text-sm">
          <MailCheck className="size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Invite sent to</span>
            <span className="block truncate font-medium">{invite.email}</span>
          </span>
        </div>

        {!me ? (
          <>
            <Button asChild variant="outline" size="lg" className="mt-5 w-full">
              <a href={googleHref}>
                <GoogleIcon /> Continue with Google
              </a>
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">Sign in with the Google account for the address above.</p>
          </>
        ) : mismatch ? (
          <>
            <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-left text-[13px] text-destructive">
              <CircleAlert className="mt-px size-4 shrink-0" />
              <span>
                You're signed in as <span className="font-medium">{me.user.email}</span>. This invite only works with {invite.email}.
              </span>
            </div>
            <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => logout.mutate(`/invite/${token}`)} disabled={logout.isPending}>
              <LogOut /> Sign out and switch account
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="mt-5 w-full" onClick={join} disabled={accept.isPending}>
              {accept.isPending && <LoaderCircle className="animate-spin" />} Join workspace
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">Signed in as {me.user.email}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden="true" className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div aria-hidden="true" className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="AgencyOS home" className="rounded-lg">
          <BrandLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm rounded-2xl border bg-card/80 p-8 shadow-pop backdrop-blur-xl"
        >
          {body}
        </motion.div>
      </main>
    </div>
  );
}
