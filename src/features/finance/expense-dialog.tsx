import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Paperclip, X } from "lucide-react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES, expenseSchema, type ExpenseInput } from "@shared/schemas/expense";
import type { ExpenseDTO, ProjectSummary } from "@shared/types";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/features/auth/api";
import { ApiError, errorMessage } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { useCreateCategory, useExpenseCategories, useSaveExpense } from "./api";

const NONE = "__none__";
const NEW_CATEGORY = "__new__";
const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  expense?: ExpenseDTO;
  projects: ProjectSummary[];
  /** Pre-select a project (and hide the picker) when adding from a project page. */
  lockedProjectId?: string;
}

function ExpenseForm({ expense, projects, lockedProjectId, onOpenChange }: Omit<ExpenseDialogProps, "open">) {
  const { workspace } = useSession();
  const { data: categories = [] } = useExpenseCategories();
  const createCategory = useCreateCategory();
  const save = useSaveExpense();
  const fileInput = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const form = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: expense?.description ?? "",
      amount: expense?.amount ?? 0,
      date: expense?.date ?? todayIso(),
      categoryId: expense?.categoryId ?? "",
      projectId: expense?.projectId ?? lockedProjectId ?? "",
      vendor: expense?.vendor ?? "",
    },
  });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) return void toast.error("Upload an image (PNG, JPEG, WebP) or a PDF.");
    if (file.size > RECEIPT_MAX_BYTES) return void toast.error("Receipts must be 5 MB or smaller.");
    setReceipt(file);
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    createCategory.mutate(name, {
      onSuccess: (category) => {
        form.setValue("categoryId", category.id, { shouldDirty: true });
        setAddingCategory(false);
        setNewCategory("");
      },
      onError: (error) => toast.error(errorMessage(error, "Could not add the category.")),
    });
  };

  const onSubmit = form.handleSubmit((input) =>
    save.mutate(
      { id: expense?.id, input, receipt },
      {
        onSuccess: () => {
          toast.success(expense ? "Expense updated" : "Expense added");
          onOpenChange(false);
        },
        onError: (error) => {
          if (error instanceof ApiError) {
            for (const [path, message] of Object.entries(error.fields)) form.setError(path as FieldPath<ExpenseInput>, { message });
          }
          toast.error(errorMessage(error, "Could not save the expense."));
        },
      },
    ),
  );

  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Figma subscription" autoComplete="off" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <MoneyInput currency={workspace.currency} value={field.value === 0 ? null : field.value} onChange={(value) => field.onChange(value ?? 0)} onBlur={field.onBlur} placeholder="0" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                {addingCategory ? (
                  <div className="flex gap-2">
                    <Input
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCategory();
                        }
                      }}
                      placeholder="New category name"
                      aria-label="New category name"
                      maxLength={40}
                      autoFocus
                    />
                    <Button type="button" variant="outline" onClick={addCategory} disabled={createCategory.isPending || newCategory.trim() === ""}>
                      Add
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Cancel new category" onClick={() => setAddingCategory(false)}>
                      <X />
                    </Button>
                  </div>
                ) : (
                  <Select value={field.value === "" ? NONE : field.value} onValueChange={(value) => (value === NEW_CATEGORY ? setAddingCategory(true) : field.onChange(value === NONE ? "" : value))}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        <span className="text-muted-foreground">Uncategorised</span>
                      </SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
                          {category.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_CATEGORY}>
                        <span className="font-medium text-primary">+ New category…</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          {!lockedProjectId && (
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project {optional}</FormLabel>
                  <Select value={field.value === "" ? NONE : field.value} onValueChange={(value) => field.onChange(value === NONE ? "" : value)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        <span className="text-muted-foreground">General (no project)</span>
                      </SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="vendor"
            render={({ field }) => (
              <FormItem className={lockedProjectId ? "" : "sm:col-span-2"}>
                <FormLabel>Paid to {optional}</FormLabel>
                <FormControl>
                  <Input placeholder="Vendor or person" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">Receipt {optional}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Paperclip /> {receipt || expense?.receipt ? "Replace file" : "Attach file"}
            </Button>
            {receipt ? (
              <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
                <span className="truncate">{receipt.name}</span>
                <button type="button" onClick={() => setReceipt(null)} aria-label="Remove selected file" className="rounded p-0.5 hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="truncate text-[13px] text-muted-foreground">{expense?.receipt ? expense.receipt.name : "Image or PDF, up to 5 MB"}</span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={RECEIPT_MIME_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {expense ? "Save changes" : "Add expense"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function ExpenseDialog({ open, onOpenChange, expense, projects, lockedProjectId }: ExpenseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "New expense"}</DialogTitle>
          <DialogDescription>{lockedProjectId ? "A cost for this project – it reduces the project's profit." : "Log a cost. Link it to a project to see that project's real profit."}</DialogDescription>
        </DialogHeader>
        {open && <ExpenseForm expense={expense} projects={projects} lockedProjectId={lockedProjectId} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
