import type { MemberSummary } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MemberAvatar({ member, className }: { member: MemberSummary; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className={cn("size-7 ring-2 ring-card", className)} aria-label={member.name}>
          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
          <AvatarFallback className="text-[10px]">{initials(member.name)}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{member.name}</TooltipContent>
    </Tooltip>
  );
}

/** Overlapping avatars with a "+N" overflow chip. */
export function AvatarStack({ members, max = 3, className }: { members: MemberSummary[]; max?: number; className?: string }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, max);
  const extra = members.length - visible.length;
  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((member) => (
        <MemberAvatar key={member.id} member={member} />
      ))}
      {extra > 0 && (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      )}
    </div>
  );
}
