import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  max?: number;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
}

/** Chips-in-a-field tag editor. Enter or comma adds; Backspace on an empty field removes the last tag. */
export function TagInput({ value, onChange, max = 10, placeholder = "Add a tag…", id, ...props }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, "").slice(0, 24);
    if (tag && value.length < max && !value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft("");
  };

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 text-sm shadow-soft transition-[border-color,box-shadow] duration-150",
        "focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/60",
        props["aria-invalid"] && "border-destructive",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-xs font-medium text-secondary-foreground">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => (event.target.value.endsWith(",") ? add(event.target.value) : setDraft(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Never submit the surrounding form from the tag field.
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={value.length === 0 ? placeholder : value.length >= max ? "" : "Add another…"}
        disabled={value.length >= max}
        className="min-w-24 flex-1 bg-transparent px-1 py-0.5 outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
      />
    </div>
  );
}
