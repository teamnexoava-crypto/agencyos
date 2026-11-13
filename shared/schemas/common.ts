import { z } from "zod";

/** Database / public identifier as sent by clients. Never trusted for tenancy – only for lookup. */
export const idSchema = z.string().regex(/^[\w-]{1,64}$/, "Invalid id");

/** "" (not set) or an id – the shape HTML selects produce. The API stores "" as NULL. */
export const optionalIdSchema = z.union([z.literal(""), idSchema]);

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar date as `YYYY-MM-DD`. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine(isRealDate, "Use a valid date");

export const optionalIsoDateSchema = z.union([z.literal(""), isoDateSchema]);

/** Amount in minor units (paise / cents). Capped well inside Number.MAX_SAFE_INTEGER. */
export const moneyMinorSchema = z
  .number({ error: "Enter an amount" })
  .int("Enter a valid amount")
  .min(0, "Amount can't be negative")
  .max(99_999_999_999_99, "That amount is too large");

/** Trimmed free text where "" means "not provided". */
export const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

/** Body for "put these rows in this order" endpoints. */
export const reorderSchema = z.object({ orderedIds: z.array(idSchema).min(1).max(500) });
export type ReorderInput = z.infer<typeof reorderSchema>;
