import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SettingsCardProps {
  title: string;
  description: string;
  children: ReactNode;
  /** Footer with the save button; omit for read-only cards. */
  saving?: boolean;
  dirty?: boolean;
  onSubmit?: () => void;
}

/** One settings form: heading, fields and its own Save button, so each card saves independently. */
export function SettingsCard({ title, description, children, saving = false, dirty = true, onSubmit }: SettingsCardProps) {
  const body = (
    <>
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-5 px-5 py-5 sm:px-6">{children}</div>
      {onSubmit && (
        <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-5 py-3 sm:px-6">
          {!dirty && <p className="text-[13px] text-muted-foreground">No changes to save</p>}
          <Button type="submit" disabled={saving || !dirty}>
            {saving && <LoaderCircle className="animate-spin" />} Save changes
          </Button>
        </div>
      )}
    </>
  );
  const className = "overflow-hidden rounded-2xl border bg-card shadow-soft";
  return onSubmit ? (
    <form
      noValidate
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {body}
    </form>
  ) : (
    <section className={className}>{body}</section>
  );
}
