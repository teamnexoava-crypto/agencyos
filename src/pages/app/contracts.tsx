import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FileSearch, FileSignature, FileText, LayoutTemplate, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import type { ContractStatus } from "@shared/constants";
import { STARTER_TEMPLATE_HTML, STARTER_TEMPLATE_NAME, contractText } from "@shared/contract";
import type { ContractTemplateDTO } from "@shared/types";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContractTemplates, useContracts, useDeleteTemplate } from "@/features/contracts/api";
import { ContractRows } from "@/features/contracts/contract-list";
import { CreateContractDialog } from "@/features/contracts/create-contract-dialog";
import { TemplateDialog } from "@/features/contracts/template-dialog";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Filter = "all" | "draft" | "waiting" | "to_sign" | "signed";
const FILTERS: { value: Filter; label: string; statuses: ContractStatus[] }[] = [
  { value: "all", label: "All", statuses: [] },
  { value: "draft", label: "Drafts", statuses: ["draft"] },
  { value: "waiting", label: "Awaiting client", statuses: ["sent", "viewed"] },
  { value: "to_sign", label: "Needs your signature", statuses: ["client_signed"] },
  { value: "signed", label: "Signed", statuses: ["completed"] },
];

const shortDate = (ms: number) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

function ContractsList({ onCreate }: { onCreate: () => void }) {
  const { data: contracts, isPending, isError, refetch } = useContracts();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, draft: 0, waiting: 0, to_sign: 0, signed: 0 };
    for (const contract of contracts ?? []) {
      for (const option of FILTERS) if (option.statuses.includes(contract.status)) result[option.value] += 1;
    }
    return result;
  }, [contracts]);

  const visible = useMemo(() => {
    const statuses = FILTERS.find((option) => option.value === filter)?.statuses ?? [];
    const q = query.trim().toLowerCase();
    return (contracts ?? []).filter(
      (contract) => (statuses.length === 0 || statuses.includes(contract.status)) && (q === "" || `${contract.title} ${contract.clientName ?? ""} ${contract.projectTitle ?? ""}`.toLowerCase().includes(q)),
    );
  }, [contracts, filter, query]);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-72 rounded-2xl" role="status" aria-label="Loading contracts" />;
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        title="No contracts yet"
        description="Draft an agreement from a template, send the link on WhatsApp and get it signed online – with a full audit trail."
        action={
          <Button onClick={onCreate}>
            <Plus /> New contract
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter contracts" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-card p-0.5 shadow-soft">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                filter === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              {option.value !== "all" && option.value !== "signed" && counts[option.value] > 0 && (
                <span className={cn("tabular ml-1.5", option.value === "to_sign" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{counts[option.value]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts…" aria-label="Search contracts" className="h-9 pl-9" />
        </div>
      </div>
      {visible.length === 0 ? <EmptyState icon={FileSearch} title="No contracts match" description="Try another filter or search term." className="py-12" /> : <ContractRows contracts={visible} />}
    </>
  );
}

type TemplateEditor = { template?: ContractTemplateDTO; seed?: { name: string; content: string } } | null;

function TemplatesList() {
  const { data: templates, isPending, isError, refetch } = useContractTemplates();
  const remove = useDeleteTemplate();
  const [editor, setEditor] = useState<TemplateEditor>(null);
  const [deleting, setDeleting] = useState<ContractTemplateDTO | null>(null);
  const starter = { name: STARTER_TEMPLATE_NAME, content: STARTER_TEMPLATE_HTML };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-56 rounded-2xl" role="status" aria-label="Loading templates" />;

  return (
    <>
      {templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Save your standard terms once. Client name, project, amount and dates are filled in for every new contract."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setEditor({ seed: starter })}>
                <Sparkles /> Start with our service agreement
              </Button>
              <Button variant="outline" onClick={() => setEditor({})}>
                <Plus /> Blank template
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length === 1 ? "" : "s"}
            </p>
            <Button variant="outline" onClick={() => setEditor({})}>
              <Plus /> New template
            </Button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template, index) => (
              <motion.li
                key={template.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(index, 6) * 0.04, ease: "easeOut" }}
                className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{template.name}</h3>
                    <p className="text-xs text-muted-foreground">Updated {shortDate(template.updatedAt)}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 flex-1 text-[13px] text-muted-foreground">{contractText(template.content).slice(0, 220)}</p>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditor({ template })}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleting(template)} aria-label={`Delete template ${template.name}`}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              </motion.li>
            ))}
          </ul>
        </>
      )}

      <TemplateDialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)} template={editor?.template} seed={editor?.seed} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Contracts you already made from it keep their text."
        onConfirm={() => {
          if (!deleting) return;
          const { id } = deleting;
          setDeleting(null);
          remove.mutate(id, { onSuccess: () => toast.success("Template deleted"), onError: (error) => toast.error(errorMessage(error, "Could not delete the template.")) });
        }}
      />
    </>
  );
}

export default function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "templates" ? "templates" : "contracts";
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Contracts"
        description="Agreements and e-signatures."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New contract
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(value) => setSearchParams(value === "templates" ? { tab: "templates" } : {}, { replace: true })}>
        <TabsList aria-label="Contract sections">
          <TabsTrigger value="contracts">
            <FileSignature /> Contracts
          </TabsTrigger>
          <TabsTrigger value="templates">
            <LayoutTemplate /> Templates
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contracts">
          <ContractsList onCreate={() => setCreateOpen(true)} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesList />
        </TabsContent>
      </Tabs>
      <CreateContractDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
