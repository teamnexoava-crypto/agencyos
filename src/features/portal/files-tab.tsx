import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Eye, EyeOff, FolderOpen, LoaderCircle, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PROJECT_FILE_ACCEPT, PROJECT_FILE_MAX_BYTES } from "@shared/schemas/portal";
import type { MemberSummary, ProjectDetail, ProjectFileDTO } from "@shared/types";
import { formatIndianDate } from "@shared/dates";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDeleteFile, useProjectFiles, useSetFileShared, useUploadFile } from "./api";
import { FileIcon } from "./file-icon";

const shortDate = (ms: number) => formatIndianDate(new Date(ms), { day: "numeric", month: "short", year: "numeric" });

interface FilesTabProps {
  project: ProjectDetail;
  members: Map<string, MemberSummary>;
}

/** Briefs, assets and deliverables for one project. Nothing reaches the client until "Visible to client" is switched on. */
export function FilesTab({ project, members }: FilesTabProps) {
  const { canManage, membership } = useSession();
  const { data: files, isPending, isError, refetch } = useProjectFiles(project.id);
  const upload = useUploadFile(project.id);
  const setShared = useSetFileShared(project.id);
  const remove = useDeleteFile(project.id);
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<ProjectFileDTO | null>(null);

  const uploadAll = async (list: FileList | File[]) => {
    const picked = [...list];
    const tooBig = picked.filter((file) => file.size > PROJECT_FILE_MAX_BYTES);
    if (tooBig.length > 0) toast.error(`${tooBig.length === 1 ? `“${tooBig[0]?.name}” is` : `${tooBig.length} files are`} larger than 20 MB and ${tooBig.length === 1 ? "was" : "were"} skipped.`);
    const queue = picked.filter((file) => file.size <= PROJECT_FILE_MAX_BYTES && file.size > 0);
    if (queue.length === 0) return;

    setUploading(queue.length);
    let done = 0;
    for (const file of queue) {
      try {
        await upload.mutateAsync(file);
        done += 1;
      } catch (error) {
        toast.error(`${file.name}: ${errorMessage(error, "upload failed.")}`);
      }
      setUploading((count) => count - 1);
    }
    if (done > 0) toast.success(done === 1 ? "File uploaded" : `${done} files uploaded`);
  };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <Skeleton className="h-56 rounded-2xl" role="status" aria-label="Loading files" />;

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      accept={PROJECT_FILE_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        if (event.target.files) void uploadAll(event.target.files);
        event.target.value = "";
      }}
    />
  );
  const uploadButton = (
    <Button onClick={() => input.current?.click()} disabled={uploading > 0}>
      {uploading > 0 ? <LoaderCircle className="animate-spin" /> : <Upload />} {uploading > 0 ? `Uploading ${uploading}…` : "Upload files"}
    </Button>
  );
  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer.files.length > 0) void uploadAll(event.dataTransfer.files);
    },
  };

  if (files.length === 0) {
    return (
      <div {...dropProps} className={cn("rounded-2xl transition-shadow", dragging && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        {picker}
        <EmptyState icon={FolderOpen} title="No files yet" description="Upload briefs, assets and deliverables – or drop them here. You choose which ones your client can see." action={uploadButton} />
      </div>
    );
  }

  const sharedCount = files.filter((file) => file.sharedWithClient).length;

  return (
    <div {...dropProps}>
      {picker}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {files.length} file{files.length === 1 ? "" : "s"}
          {canManage && ` · ${sharedCount} visible to the client`}
        </p>
        {uploadButton}
      </div>

      <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow", dragging && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        <AnimatePresence initial={false}>
          {files.map((file) => {
            const uploader = file.uploadedBy ? members.get(file.uploadedBy)?.name : null;
            const mayDelete = canManage || file.uploadedBy === membership.id;
            return (
              <motion.li key={file.id} layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <FileIcon contentType={file.contentType} />
                  <div className="min-w-0">
                    <a href={`/api/files/${file.id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:text-primary">
                      {file.name}
                    </a>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {formatBytes(file.size)} · {shortDate(file.createdAt)}
                      {uploader && ` · ${uploader}`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {canManage ? (
                    <label className="mr-2 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                      <Switch
                        checked={file.sharedWithClient}
                        onCheckedChange={(shared) =>
                          setShared.mutate({ fileId: file.id, shared }, { onError: (error) => toast.error(errorMessage(error, "Could not change who sees this file.")) })
                        }
                        aria-label={`Show ${file.name} to the client`}
                      />
                      <span className={cn("flex items-center gap-1", file.sharedWithClient && "text-foreground")}>
                        {file.sharedWithClient ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        {file.sharedWithClient ? "Visible to client" : "Team only"}
                      </span>
                    </label>
                  ) : (
                    file.sharedWithClient && (
                      <span className="mr-2 flex items-center gap-1 text-[13px] text-muted-foreground">
                        <Eye className="size-3.5" /> Visible to client
                      </span>
                    )
                  )}
                  <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
                    <a href={`/api/files/${file.id}`} download={file.name} aria-label={`Download ${file.name}`}>
                      <Download />
                    </a>
                  </Button>
                  {mayDelete && (
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${file.name}`} onClick={() => setDeleting(file)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <p className="mt-3 text-[13px] text-muted-foreground">Drop files anywhere on this list to upload. Up to 20 MB each.</p>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={deleting?.sharedWithClient ? "It will also disappear from the client's page. This can't be undone." : "This can't be undone."}
        onConfirm={() => {
          if (!deleting) return;
          const { id } = deleting;
          setDeleting(null);
          remove.mutate(id, { onSuccess: () => toast.success("File deleted"), onError: (error) => toast.error(errorMessage(error, "Could not delete the file.")) });
        }}
      />
    </div>
  );
}
