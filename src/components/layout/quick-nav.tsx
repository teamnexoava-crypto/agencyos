import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CornerDownLeft, FileSignature, FolderKanban, LoaderCircle, ReceiptText, Search, UserRound, UserRoundSearch, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import type { SearchResult } from "@shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/features/auth/api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { allNavItems } from "./nav";

interface QuickNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RESULT_META: Record<SearchResult["type"], { icon: LucideIcon; label: string }> = {
  project: { icon: FolderKanban, label: "Project" },
  client: { icon: UserRound, label: "Client" },
  invoice: { icon: ReceiptText, label: "Invoice" },
  contract: { icon: FileSignature, label: "Contract" },
  lead: { icon: UserRoundSearch, label: "Lead" },
};

interface Entry {
  key: string;
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string | null;
}

/** The typed text, a beat later – so the server is asked once per pause, not once per keystroke. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * ⌘K / Ctrl+K palette: jump to any section, or search projects, clients, invoices and contracts.
 * The server only returns what the signed-in person may see.
 */
export function QuickNav({ open, onOpenChange }: QuickNavProps) {
  const navigate = useNavigate();
  const { role } = useSession();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => allNavItems(role), [role]);
  const term = useDebounced(query.trim(), 180);
  const search = useQuery({
    queryKey: ["search", term],
    queryFn: async ({ signal }) => (await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(term)}`, { signal })).results,
    enabled: open && term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const searching = query.trim().length >= 2 && (search.isFetching || term !== query.trim());

  const results = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = (
      q
        ? items
            // Rank: label starts with the query → label contains it → keyword match.
            .map((item) => {
              const label = item.label.toLowerCase();
              const rank = label.startsWith(q) ? 0 : label.includes(q) ? 1 : (item.keywords ?? "").toLowerCase().includes(q) ? 2 : -1;
              return { item, rank };
            })
            .filter((entry) => entry.rank >= 0)
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => entry.item)
        : items
    ).map((item): Entry => ({ key: item.to, to: item.to, icon: item.icon, label: item.label, hint: null }));
    const found = q.length >= 2 ? (search.data ?? []) : [];
    const records = found.map((result): Entry => ({
      key: `${result.type}-${result.id}`,
      to: result.to,
      icon: RESULT_META[result.type].icon,
      label: result.title,
      hint: [RESULT_META[result.type].label, result.subtitle].filter(Boolean).join(" · "),
    }));
    return [...pages, ...records];
  }, [items, query, search.data]);

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
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Type to filter, use the arrow keys to move and Enter to open.</DialogDescription>

        <div className="flex items-center gap-3 border-b px-4">
          {searching ? <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <Search className="size-4 shrink-0 text-muted-foreground" />}
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
            placeholder="Search projects, leads, clients, invoices…"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-nav-list"
            aria-activedescendant={results[safeIndex] ? `quick-nav-${safeIndex}` : undefined}
            aria-label="Search"
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
          />
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:block">Esc</kbd>
        </div>

        <ul ref={listRef} id="quick-nav-list" role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{searching ? "Searching…" : `No matches for “${query}”`}</li>}
          {results.map((item, index) => {
            const Icon = item.icon;
            const active = index === safeIndex;
            return (
              <li
                key={item.key}
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
                <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-muted-foreground">{item.hint}</span>}
                </span>
                {active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
