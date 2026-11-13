import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, type ProjectStatus } from "@shared/constants";
import { projectSchema, type ProjectInput } from "@shared/schemas/project";
import type { ProjectDetail } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/api";
import { useClients } from "@/features/clients/api";
import { useMembers } from "@/features/members/api";
import { MemberChecklist } from "@/features/members/member-select";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateProject, useUpdateProject } from "./api";
import { PRIORITY_META, STATUS_META } from "./meta";

const NO_CLIENT = "__none__";
const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  project?: ProjectDetail;
  /** Pre-selected values for "new project" (e.g. from a kanban column or a client page). */
  defaults?: { status?: ProjectStatus; clientId?: string };
  onSaved?: (project: ProjectDetail) => void;
}

function ProjectForm({ project, defaults, onOpenChange, onSaved }: Omit<ProjectFormDialogProps, "open">) {
  const { workspace } = useSession();
  const { data: clients = [] } = useClients();
  const { data: members = [] } = useMembers();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? "");
  const saving = create.isPending || update.isPending;

  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: project?.title ?? "",
      clientId: project?.clientId ?? defaults?.clientId ?? "",
      description: project?.description ?? "",
      startDate: project?.startDate ?? "",
      dueDate: project?.dueDate ?? "",
      budget: project?.budget ?? 0,
      status: project?.status ?? defaults?.status ?? "lead",
      priority: project?.priority ?? "medium",
      tags: project?.tags ?? [],
      memberIds: project?.memberIds ?? [],
    },
  });

  const onSubmit = form.handleSubmit((input) => {
    const mutation = project ? update : create;
    mutation.mutate(input, {
      onSuccess: (saved) => {
        toast.success(project ? "Project updated" : "Project created");
        onSaved?.(saved);
        onOpenChange(false);
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<ProjectInput>, { message });
        }
        toast.error(errorMessage(error, "Could not save the project."));
      },
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Website redesign" autoComplete="off" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client {optional}</FormLabel>
                <Select value={field.value === "" ? NO_CLIENT : field.value} onValueChange={(value) => field.onChange(value === NO_CLIENT ? "" : value)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_CLIENT}>
                      <span className="text-muted-foreground">No client</span>
                    </SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                        {client.company && <span className="text-muted-foreground">· {client.company}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="budget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Budget</FormLabel>
                <FormControl>
                  <MoneyInput currency={workspace.currency} value={field.value === 0 ? null : field.value} onChange={(value) => field.onChange(value ?? 0)} onBlur={field.onBlur} placeholder="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROJECT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_META[status].dot}`} />
                        {STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PROJECT_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {PRIORITY_META[priority].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date {optional}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due date {optional}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="tags"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Tags {optional}</FormLabel>
              <FormControl>
                <TagInput value={field.value} onChange={field.onChange} aria-invalid={fieldState.invalid} placeholder="e.g. branding, web – press Enter" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {members.length > 0 && (
          <FormField
            control={form.control}
            name="memberIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team {optional}</FormLabel>
                <MemberChecklist members={members} value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description {optional}</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Scope, goals, links…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <LoaderCircle className="animate-spin" />}
            {project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function ProjectFormDialog({ open, onOpenChange, project, defaults, onSaved }: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>{project ? "Update the project's details and team." : "Set up the basics – you can add milestones and tasks next."}</DialogDescription>
        </DialogHeader>
        {open && <ProjectForm project={project} defaults={defaults} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
