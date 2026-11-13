import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/features/auth/api";
import { cn } from "@/lib/utils";
import { allNavItems } from "./nav";

interface QuickNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ⌘K / Ctrl+K palette. For now it jumps between sections of the app; global search across clients,
 * projects, invoices and contracts plugs into this same surface in Phase 8.
 */
export function QuickNav({ open, onOpenChange }: QuickNavProps) {
  const navigate = useNavigate();
  const { role } = useSession();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => allNavItems(role), [role]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Rank: label starts with the query → label contains it → keyword match.
    const score = (label: string, keywords: string) => {
      if (label.startsWith(q)) return 0;
      if (label.includes(q)) return 1;
      return keywords.includes(q) ? 2 : -1;
    };
    return items
      .map((item) => ({ item, rank: score(item.label.toLowerCase(), (item.keywords ?? "").toLowerCase()) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.item);
  }, [items, query]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
    onOpenChange(next);
  };

  const go = (to: string) => {
    handleOpenChange(false);
    void navigate(to);
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const safeIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Quick navigation</DialogTitle>
        <DialogDescription className="sr-only">Type to filter, use the arrow keys to move and Enter to open.</DialogDescription>

        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((safeIndex + 1) % Math.max(1, results.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((safeIndex - 1 + results.length) % Math.max(1, results.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                const target = results[safeIndex];
                if (target) go(target.to);
              }
            }}
            placeholder="Jump to…"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-nav-list"
            aria-activedescendant={results[safeIndex] ? `quick-nav-${safeIndex}` : undefined}
            aria-label="Search pages"
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">Esc</kbd>
        </div>

        <ul ref={listRef} id="quick-nav-list" role="listbox" aria-label="Pages" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for "{query}"</li>}
          {results.map((item, index) => {
            const Icon = item.icon;
            const active = index === safeIndex;
            return (
              <li
                key={item.to}
                id={`quick-nav-${index}`}
                role="option"
                aria-selected={active}
                data-active={active}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => go(item.to)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
                <span className="flex-1 font-medium">{item.label}</span>
                {active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
