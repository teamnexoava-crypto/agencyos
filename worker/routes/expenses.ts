import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { idSchema, isoDateSchema } from "../../shared/schemas/common";
import { RECEIPT_MAX_BYTES, expenseCategorySchema, expenseSchema } from "../../shared/schemas/expense";
import type { ExpenseCategoryDTO, ExpenseDTO } from "../../shared/types";
import { expenseCategories, expenses, files, projects } from "../db/schema";
import { ApiError, badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { tenant, type Tenant } from "../lib/tenant";
import { cleanFileName, sniffReceipt } from "../lib/uploads";
import { validate } from "../lib/validate";
import { requireAuth } from "../middleware/context";
import { logActivity } from "../services/activity";
import { assertFeature, assertStorageAvailable } from "../services/billing";
import { requireProject } from "../services/projects";
import type { AppEnv } from "../types";

const idParam = z.object({ id: idSchema });
const listQuery = z.object({ from: isoDateSchema.optional(), to: isoDateSchema.optional(), projectId: idSchema.optional() });
const emptyToNull = (value: string): string | null => (value === "" ? null : value);

const CATEGORY_COLORS = ["#6366f1", "#0ea5e9", "#14b8a6", "#84cc16", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444"];

async function loadExpenses(t: Tenant, filter: { from?: string; to?: string; projectId?: string; id?: string }): Promise<ExpenseDTO[]> {
  const rows = await t.db
    .select({ expense: expenses, categoryName: expenseCategories.name, projectTitle: projects.title, fileName: files.name })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(files, and(eq(files.id, expenses.receiptFileId), isNull(files.deletedAt)))
    .where(
      t.where(
        expenses,
        isNull(expenses.deletedAt),
        filter.id ? eq(expenses.id, filter.id) : undefined,
        filter.from ? gte(expenses.date, filter.from) : undefined,
        filter.to ? lte(expenses.date, filter.to) : undefined,
        filter.projectId ? eq(expenses.projectId, filter.projectId) : undefined,
      ),
    )
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(2000);

  return rows.map(({ expense, categoryName, projectTitle, fileName }) => ({
    id: expense.id,
    description: expense.description,
    amount: expense.amount,
    date: expense.date,
    vendor: expense.vendor,
    categoryId: expense.categoryId,
    categoryName,
    projectId: expense.projectId,
    projectTitle,
    receipt: expense.receiptFileId && fileName ? { fileId: expense.receiptFileId, name: fileName } : null,
  }));
}

async function requireExpense(t: Tenant, id: string) {
  const [row] = await t.db
    .select()
    .from(expenses)
    .where(t.where(expenses, eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);
  if (!row) throw notFound("Expense");
  return row;
}

/** Ids from the browser are checked against this workspace before they are linked to an expense. */
async function checkLinks(t: Tenant, input: { categoryId: string; projectId: string }, existing?: { projectId: string | null }) {
  // An unchanged project is not re-checked, so an expense stays editable after its project is deleted.
  if (input.projectId && input.projectId !== existing?.projectId) await requireProject(t, input.projectId);
  if (input.categoryId) {
    const [category] = await t.db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(t.where(expenseCategories, eq(expenseCategories.id, input.categoryId)))
      .limit(1);
    if (!category) throw new ApiError(400, "invalid_category", "That category doesn't exist in this workspace.");
  }
}

/** Marks a receipt file as deleted and removes its object from R2. */
async function dropReceipt(t: Tenant, bucket: R2Bucket, fileId: string) {
  const [file] = await t.db
    .update(files)
    .set({ deletedAt: new Date() })
    .where(t.where(files, eq(files.id, fileId)))
    .returning({ key: files.r2Key });
  if (file) await bucket.delete(file.key);
}

/** Expenses are financial data: owner/admin only. */
export const expenseRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    tenant(c).requireRole("owner", "admin");
    await next();
  })

  .get("/", validate("query", listQuery), async (c) => {
    const t = tenant(c);
    return c.json({ expenses: await loadExpenses(t, c.req.valid("query")) });
  })

  .get("/categories", async (c) => {
    const t = tenant(c);
    const rows = await t.db
      .select()
      .from(expenseCategories)
      .where(t.where(expenseCategories))
      .orderBy(asc(expenseCategories.name));
    const categories: ExpenseCategoryDTO[] = rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
    return c.json({ categories });
  })

  .post("/categories", validate("json", expenseCategorySchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "finance");
    const { name } = c.req.valid("json");
    const existing = await t.db
      .select()
      .from(expenseCategories)
      .where(t.where(expenseCategories));
    const duplicate = existing.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return c.json({ category: { id: duplicate.id, name: duplicate.name, color: duplicate.color } });

    const [row] = await t.db
      .insert(expenseCategories)
      .values({ workspaceId: t.workspaceId, name, color: CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length] ?? "#94a3b8" })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    return c.json({ category: { id: row.id, name: row.name, color: row.color } }, 201);
  })

  .post("/", validate("json", expenseSchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "finance");
    const input = c.req.valid("json");
    await checkLinks(t, input);
    const [row] = await t.db
      .insert(expenses)
      .values({
        workspaceId: t.workspaceId,
        description: input.description,
        amount: input.amount,
        date: input.date,
        categoryId: emptyToNull(input.categoryId),
        projectId: emptyToNull(input.projectId),
        vendor: emptyToNull(input.vendor),
        createdBy: t.member.id,
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    c.var.defer(
      logActivity(t, { type: "expense.created", summary: `${t.user.name} logged an expense: ${row.description}`, entityType: "expense", entityId: row.id, projectId: row.projectId, financeOnly: true }),
    );
    const [expense] = await loadExpenses(t, { id: row.id });
    return c.json({ expense }, 201);
  })

  .patch("/:id", validate("param", idParam), validate("json", expenseSchema), async (c) => {
    const t = tenant(c);
    assertFeature(t, c.env, "finance");
    const existing = await requireExpense(t, c.req.valid("param").id);
    const input = c.req.valid("json");
    await checkLinks(t, input, existing);
    await t.db
      .update(expenses)
      .set({
        description: input.description,
        amount: input.amount,
        date: input.date,
        categoryId: emptyToNull(input.categoryId),
        projectId: emptyToNull(input.projectId),
        vendor: emptyToNull(input.vendor),
        updatedAt: new Date(),
      })
      .where(t.where(expenses, eq(expenses.id, existing.id)));
    const [expense] = await loadExpenses(t, { id: existing.id });
    return c.json({ expense });
  })

  .delete("/:id", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireExpense(t, c.req.valid("param").id);
    await t.db
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(t.where(expenses, eq(expenses.id, existing.id)));
    if (existing.receiptFileId) c.var.defer(dropReceipt(t, c.env.BUCKET, existing.receiptFileId));
    return c.json({ ok: true });
  })

  /** Attach (or replace) a receipt. multipart/form-data, field `file`: PNG, JPEG, WebP or PDF up to 5 MB. */
  .post(
    "/:id/receipt",
    validate("param", idParam),
    bodyLimit({
      maxSize: RECEIPT_MAX_BYTES + 64 * 1024,
      onError: () => {
        throw new ApiError(413, "file_too_large", "Receipts must be 5 MB or smaller.");
      },
    }),
    async (c) => {
      const t = tenant(c);
      const existing = await requireExpense(t, c.req.valid("param").id);

      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw badRequest("Attach a file in the `file` field.", "file_missing");
      if (file.size === 0) throw badRequest("That file is empty.", "file_empty");
      if (file.size > RECEIPT_MAX_BYTES) throw new ApiError(413, "file_too_large", "Receipts must be 5 MB or smaller.");

      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffReceipt(bytes);
      if (!kind) throw new ApiError(415, "unsupported_type", "Upload an image (PNG, JPEG, WebP) or a PDF.");

      assertFeature(t, c.env, "finance");
      await assertStorageAvailable(t, c.env, bytes.byteLength);
      const key = `ws/${t.workspaceId}/receipts/${newId()}.${kind.ext}`;
      await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: kind.mime } });
      const [stored] = await t.db
        .insert(files)
        .values({
          workspaceId: t.workspaceId,
          projectId: existing.projectId,
          kind: "receipt",
          r2Key: key,
          name: cleanFileName(file.name, `receipt.${kind.ext}`),
          contentType: kind.mime,
          size: bytes.byteLength,
          uploadedBy: t.member.id,
        })
        .returning({ id: files.id });
      if (!stored) throw new Error("Insert returned no row");
      await t.db
        .update(expenses)
        .set({ receiptFileId: stored.id, updatedAt: new Date() })
        .where(t.where(expenses, eq(expenses.id, existing.id)));
      if (existing.receiptFileId) c.var.defer(dropReceipt(t, c.env.BUCKET, existing.receiptFileId));

      const [expense] = await loadExpenses(t, { id: existing.id });
      return c.json({ expense }, 201);
    },
  )

  .delete("/:id/receipt", validate("param", idParam), async (c) => {
    const t = tenant(c);
    const existing = await requireExpense(t, c.req.valid("param").id);
    if (existing.receiptFileId) {
      await t.db
        .update(expenses)
        .set({ receiptFileId: null, updatedAt: new Date() })
        .where(t.where(expenses, eq(expenses.id, existing.id)));
      await dropReceipt(t, c.env.BUCKET, existing.receiptFileId);
    }
    const [expense] = await loadExpenses(t, { id: existing.id });
    return c.json({ expense });
  });
