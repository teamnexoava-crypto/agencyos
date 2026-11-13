import { z } from "zod";
import { isoDateSchema, moneyMinorSchema, optionalIdSchema, optionalText } from "./common";

export const expenseSchema = z.object({
  description: z.string().trim().min(1, "What was this expense for?").max(200, "Keep the description under 200 characters"),
  amount: moneyMinorSchema.refine((value) => value > 0, "Enter the amount"),
  date: isoDateSchema,
  categoryId: optionalIdSchema,
  /** "" = general (non-project) expense. */
  projectId: optionalIdSchema,
  vendor: optionalText(120),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "Name the category").max(40, "Keep the name under 40 characters"),
});

/** Inclusive date range used by every report: both YYYY-MM-DD. */
export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((value) => value.from <= value.to, { message: "The start date must be before the end date", path: ["to"] })
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) <= 5 * 366 * 86_400_000, { message: "Choose a range of 5 years or less", path: ["to"] });
export type DateRange = z.infer<typeof dateRangeSchema>;

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
