import { useState } from "react";
import { motion } from "motion/react";
import { Clock, Copy, Mail, MessageCircle, MoreHorizontal, Pencil, UserMinus, UserPlus, X } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { TeamMemberDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/features/auth/api";
import { useRemoveMember, useRevokeInvite, useTeam, type PendingInvite } from "@/features/team/api";
import { InviteDialog } from "@/features/team/invite-dialog";
import { MemberEditDialog } from "@/features/team/member-edit-dialog";
import { useInviteShare } from "@/features/team/share";
import { errorMessage } from "@/lib/api";
import { formatMoney, initials } from "@/lib/format";

const ROLE_BADGE = { owner: "default", admin: "secondary", member: "outline" } as const;

function InviteRow({ invite, template }: { invite: PendingInvite; template: string }) {
  const share = useInviteShare({ invite, template });
  const revoke = useRevokeInvite();
  const { daysLeft } = invite;

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{invite.email}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="capitalize">{invite.role}</span>
            {invite.designation && <span>· {invite.designation}</span>}
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={share.copy}>
          <Copy /> Copy link
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="text-[#1fb957]">
              <a href={share.whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={`Share invite for ${invite.email} on WhatsApp`}>
                <MessageCircle />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share on WhatsApp</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Revoke invite for ${invite.email}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() =>
                revoke.mutate(invite.id, {
                  onSuccess: () => toast.success("Invite revoked"),
                  onError: (error) => toast.error(errorMessage(error, "Could not revoke the invite.")),
                })
              }
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Revoke</TooltipContent>
        </Tooltip>
      </div>
    </li>
  );
}

export default function TeamPage() {
  const { canManage, isOwner, membership, workspace } = useSession();
  const { data: team, isPending, isError, refetch } = useTeam();
  const removeMember = useRemoveMember();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMemberDTO | null>(null);
  const [removing, setRemoving] = useState<TeamMemberDTO | null>(null);

  /** Mirrors the server's rules so the menu only offers what will actually be allowed. */
  const canEdit = (member: TeamMemberDTO) => canManage && (isOwner || member.role === "member" || member.id === membership.id);
  const canRemove = (member: TeamMemberDTO) => canManage && member.role !== "owner" && member.id !== membership.id && (isOwner || member.role === "member");
  const canOpen = (member: TeamMemberDTO) => canManage || member.id === membership.id;

  const inviteButton = canManage && (
    <Button onClick={() => setInviteOpen(true)}>
      <UserPlus /> Invite teammate
    </Button>
  );

  return (
    <>
      <PageHeader title="Team" description={canManage ? "Invite people and control what they can see." : `Everyone at ${workspace.name}.`} actions={inviteButton} />

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading team">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {team.members.map((member, index) => {
              const isYou = member.id === membership.id;
              return (
                <motion.li
                  key={member.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index, 9) * 0.04, ease: "easeOut" }}
                  className="relative flex flex-col rounded-2xl border bg-card p-5 shadow-soft transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
                >
                  <div className="flex items-start gap-3.5">
                    <Avatar className="size-11">
                      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
                      <AvatarFallback className="text-sm">{initials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        {canOpen(member) ? (
                          <Link to={`/app/team/${member.id}`} className="truncate font-medium after:absolute after:inset-0 hover:text-primary">
                            {member.name}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{member.name}</span>
                        )}
                        {isYou && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">You</span>}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">{member.designation ?? member.email}</p>
                    </div>
                    {(canEdit(member) || canRemove(member)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`} className="relative z-10 -mt-1 -mr-2 text-muted-foreground">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit(member) && (
                            <DropdownMenuItem onSelect={() => setEditing(member)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                          )}
                          {canRemove(member) && (
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
                              <UserMinus /> Remove from workspace
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant={ROLE_BADGE[member.role]} className="capitalize">
                      {member.role}
                    </Badge>
                    {member.monthlyCost !== null && <span className="tabular text-xs text-muted-foreground">{formatMoney(member.monthlyCost, workspace.currency)} / month</span>}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Projects</dt>
                      <dd className="tabular mt-0.5 font-semibold">{member.projectCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Open tasks</dt>
                      <dd className="tabular mt-0.5 font-semibold">{member.openTasks}</dd>
                    </div>
                  </dl>
                </motion.li>
              );
            })}
          </ul>

          {canManage && (
            <section aria-labelledby="pending-invites" className="mt-10">
              <h2 id="pending-invites" className="mb-3 flex items-center gap-2 text-sm font-semibold">
                Pending invites
                {team.invites.length > 0 && <Badge variant="secondary">{team.invites.length}</Badge>}
              </h2>
              {team.invites.length === 0 ? (
                <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">No invites waiting. Invite a teammate and share the link on WhatsApp.</p>
                  <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus /> Invite teammate
                  </Button>
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
                  {team.invites.map((invite) => (
                    <InviteRow key={invite.id} invite={invite} template={team.inviteTemplate} />
                  ))}
                </ul>
              )}
            </section>
          )}

          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} template={team.inviteTemplate} />
        </>
      )}

      <MemberEditDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} member={editing} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this person"}?`}
        description="They lose access to this workspace immediately and are taken off every project. Work they did stays."
        confirmLabel="Remove"
        onConfirm={() => {
          if (!removing) return;
          const name = removing.name;
          removeMember.mutate(removing.id, {
            onSuccess: () => toast.success(`${name} removed`),
            onError: (error) => toast.error(errorMessage(error, "Could not remove this person.")),
          });
          setRemoving(null);
        }}
      />
    </>
  );
}
