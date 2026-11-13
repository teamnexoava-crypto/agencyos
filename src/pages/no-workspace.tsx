import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, LoaderCircle, LogOut } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createWorkspaceSchema, type CreateWorkspaceInput } from "@shared/schemas/workspace";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useLogout } from "@/features/auth/api";
import { useCreateWorkspace } from "@/features/onboarding/api";
import { errorMessage } from "@/lib/api";

/** Shown when a signed-in user no longer belongs to any workspace (e.g. they were removed). */
export default function NoWorkspacePage() {
  const logout = useLogout();
  const createWorkspace = useCreateWorkspace();
  const form = useForm<CreateWorkspaceInput>({ resolver: zodResolver(createWorkspaceSchema), defaultValues: { name: "" } });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lift">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">You're not in a workspace</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your access to your previous workspace was removed. Ask the owner for a new invite link, or start your own agency workspace.
        </p>

        <Form {...form}>
          <form
            className="mt-6 space-y-4"
            noValidate
            onSubmit={form.handleSubmit((input) =>
              createWorkspace.mutate(input, { onError: (error) => toast.error(errorMessage(error, "Could not create the workspace.")) }),
            )}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agency name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Northwind Studio" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending && <LoaderCircle className="animate-spin" />} Create workspace
            </Button>
          </form>
        </Form>

        <Button variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut /> Sign out
        </Button>
      </div>
    </div>
  );
}
