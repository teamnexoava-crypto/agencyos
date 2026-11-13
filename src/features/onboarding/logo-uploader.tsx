import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from "@shared/constants";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRemoveLogo, useUploadLogo } from "./api";

interface LogoUploaderProps {
  logoUrl: string | null;
}

const ACCEPT = LOGO_MIME_TYPES.join(",");

/** Click-or-drop logo picker. Uploads immediately to R2 and shows the stored image. */
export function LogoUploader({ logoUrl }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const busy = upload.isPending || remove.isPending;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    // Friendly client-side checks; the server re-validates by sniffing the actual bytes.
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Upload a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logo must be 2 MB or smaller.");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success("Logo uploaded"),
      onError: (error) => toast.error(errorMessage(error, "Could not upload the logo.")),
    });
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files[0]);
        }}
        aria-label={logoUrl ? "Replace logo" : "Upload logo"}
        className={cn(
          "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/50 text-muted-foreground transition-colors duration-150",
          "hover:border-primary/60 hover:bg-accent hover:text-primary",
          dragging && "border-primary bg-accent text-primary",
          logoUrl && "border-solid bg-white",
        )}
      >
        {logoUrl ? <img src={logoUrl} alt="Your logo" className="size-full object-contain p-1.5" /> : <ImagePlus className="size-6" />}
        {upload.isPending && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <LoaderCircle className="size-5 animate-spin text-primary" />
          </span>
        )}
      </button>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {logoUrl ? "Replace" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => remove.mutate(undefined, { onError: (error) => toast.error(errorMessage(error, "Could not remove the logo.")) })}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Shown on invoices, contracts and client links.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = ""; // allow re-selecting the same file
        }}
      />
    </div>
  );
}
