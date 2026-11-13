import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { contractTemplateSchema } from "@shared/schemas/contract";
import type { ContractTemplateDTO } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useSaveTemplate } from "./api";
import { RichEditor } from "./rich-editor";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  template?: ContractTemplateDTO;
  /** Starting point for a new template (e.g. the built-in starter). */
  seed?: { name: string; content: string };
}

function TemplateForm({ template, seed, onOpenChange }: Omit<TemplateDialogProps, "open">) {
  const save = useSaveTemplate();
  const [name, setName] = useState(template?.name ?? seed?.name ?? "");
  const [content, setContent] = useState(template?.content ?? seed?.content ?? "");
  const [errors, setErrors] = useState<{ name?: string; content?: string }>({});

  const submit = () => {
    const parsed = contractTemplateSchema.safeParse({ name, content });
    if (!parsed.success) {
      const next: { name?: string; content?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "name" || field === "content") && !next[field]) next[field] = issue.message;
      }
      return setErrors(next);
    }
    setErrors({});
    save.mutate(
      { id: template?.id, input: parsed.data },
      {
        onSuccess: () => {
          toast.success(template ? "Template updated" : "Template saved");
          onOpenChange(false);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not save the template.")),
      },
    );
  };

  return (
    <form
      className="grid min-h-0 gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="template-name">Template name</Label>
        <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Service agreement" autoComplete="off" aria-invalid={Boolean(errors.name)} />
        {errors.name && <p className="text-[13px] text-destructive">{errors.name}</p>}
      </div>
      <div className="grid min-h-0 gap-2">
        <Label>Agreement text</Label>
        <RichEditor
          initialContent={template?.content ?? seed?.content ?? ""}
          onChange={setContent}
          variables
          ariaLabel="Agreement text"
          className="[--editor-min-height:16rem] [&_.ProseMirror]:max-h-[45dvh] [&_.ProseMirror]:overflow-y-auto"
        />
        {errors.content ? (
          <p className="text-[13px] text-destructive">{errors.content}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Use <span className="font-medium text-foreground">Insert field</span> for details that change per contract – like {"{client_name}"} or {"{amount}"}. They're filled in when you create a contract.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" />} {template ? "Save changes" : "Save template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TemplateDialog({ open, onOpenChange, template, seed }: TemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Your standard terms, written once and reused for every client.</DialogDescription>
        </DialogHeader>
        {open && <TemplateForm template={template} seed={seed} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
