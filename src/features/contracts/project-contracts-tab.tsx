import { useState } from "react";
import { FileSignature, Plus } from "lucide-react";
import type { ProjectDetail } from "@shared/types";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContracts } from "./api";
import { ContractRows } from "./contract-list";
import { CreateContractDialog } from "./create-contract-dialog";

/** The agreement(s) for one project: draft, send for signature, and keep the signed copy. */
export function ProjectContractsTab({ project }: { project: ProjectDetail }) {
  const { data: contracts, isPending, isError, refetch } = useContracts({ projectId: project.id });
  const [createOpen, setCreateOpen] = useState(false);

  const createButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus /> New contract
    </Button>
  );
  const dialog = <CreateContractDialog open={createOpen} onOpenChange={setCreateOpen} project={{ id: project.id, title: project.title, clientId: project.clientId }} />;

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-40 rounded-2xl" role="status" aria-label="Loading contracts" />;

  if (contracts.length === 0) {
    return (
      <>
        <EmptyState
          icon={FileSignature}
          title="No contract for this project"
          description={project.clientId ? "Draft an agreement from a template, send it for e-signature and keep the signed copy here." : "Add a client to this project first – a contract needs someone to sign it."}
          action={project.clientId ? createButton : undefined}
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {contracts.length} contract{contracts.length === 1 ? "" : "s"} for this project
        </p>
        {createButton}
      </div>
      <ContractRows contracts={contracts} hide={["project", "client"]} />
      {dialog}
    </>
  );
}
