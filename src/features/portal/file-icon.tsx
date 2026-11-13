import { File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon tile for a file, chosen from its (server-decided) content type. */
export function FileIcon({ contentType, className }: { contentType: string; className?: string }) {
  const [Icon, tone] = contentType.startsWith("image/")
    ? [FileImage, "bg-violet-500/10 text-violet-600 dark:text-violet-300"]
    : contentType === "application/pdf"
      ? [FileText, "bg-rose-500/10 text-rose-600 dark:text-rose-300"]
      : contentType.startsWith("video/")
        ? [FileVideo, "bg-sky-500/10 text-sky-600 dark:text-sky-300"]
        : contentType.includes("spreadsheet") || contentType.includes("excel") || contentType.startsWith("text/csv")
          ? [FileSpreadsheet, "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"]
          : contentType.includes("presentation") || contentType.includes("powerpoint")
            ? [Presentation, "bg-amber-500/12 text-amber-600 dark:text-amber-300"]
            : contentType === "application/zip"
              ? [FileArchive, "bg-slate-500/10 text-slate-600 dark:text-slate-300"]
              : contentType.includes("word") || contentType.startsWith("text/")
                ? [FileText, "bg-blue-500/10 text-blue-600 dark:text-blue-300"]
                : [File, "bg-slate-500/10 text-slate-600 dark:text-slate-300"];
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone, className)}>
      <Icon className="size-5" />
    </span>
  );
}
