import type { MemberSummary } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NONE = "__none__"; // Radix Select items cannot have an empty-string value.

interface MemberSelectProps {
  members: MemberSummary[];
  /** Member id, or "" for unassigned. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

function MemberLine({ member }: { member: MemberSummary }) {
  return (
    <>
      <Avatar className="size-5">
        {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
        <AvatarFallback className="text-[9px]">{initials(member.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{member.name}</span>
    </>
  );
}

/** Single-person picker with an explicit "Unassigned" choice. */
export function MemberSelect({ members, value, onChange, placeholder = "Unassigned", className, id, ...props }: MemberSelectProps) {
  return (
    <Select value={value === "" ? NONE : value} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
      <SelectTrigger id={id} className={className} aria-label={props["aria-label"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <MemberLine member={member} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface MemberChecklistProps {
  members: MemberSummary[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

/** Multi-select as a simple checklist – clearer on phones than a tag-style combobox. */
export function MemberChecklist({ members, value, onChange, className }: MemberChecklistProps) {
  const selected = new Set(value);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <ul className={cn("max-h-52 divide-y overflow-y-auto rounded-lg border bg-card", className)}>
      {members.map((member) => (
        <li key={member.id}>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/60">
            <Checkbox checked={selected.has(member.id)} onCheckedChange={() => toggle(member.id)} />
            <MemberLine member={member} />
            <span className="ml-auto shrink-0 text-xs text-muted-foreground capitalize">{member.designation ?? member.role}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
