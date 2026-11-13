import { z } from "zod";
import { DISCOUNT_TYPES, PAYMENT_METHODS, TAX_MODES } from "../constants";
import { idSchema, isoDateSchema, moneyMinorSchema, optionalIdSchema, optionalText } from "./common";

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Describe this line").max(300, "Keep the description under 300 characters"),
  quantity: z
    .number({ error: "Enter a quantity" })
    .positive("Quantity must be more than 0")
    .max(1_000_000, "That quantity is too large")
    .refine((value) => Number.isInteger(Math.round(value * 1000)) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, "Use up to 3 decimal places"),
  /** Price per unit, minor units. */
  rate: moneyMinorSchema,
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

const invoiceFields = z.object({
  clientId: idSchema.or(z.literal("")).refine((value) => value !== "", "Choose a client"),
  projectId: optionalIdSchema,
  issueDate: isoDateSchema,
  dueDate: isoDateSchema,
  items: z.array(invoiceItemSchema).min(1, "Add at least one line item").max(100, "Use up to 100 line items"),
  discountType: z.enum(DISCOUNT_TYPES),
  /** Basis points when percent (1000 = 10%), minor units when fixed. */
  discountValue: z.number().int().min(0).max(99_999_999_999_99),
  taxMode: z.enum(TAX_MODES),
  /** Total GST rate in basis points (1800 = 18%). */
  taxRate: z.number().int().min(0, "Rate can't be negative").max(10_000, "Rate can't be more than 100%"),
  notes: optionalText(2000),
  terms: optionalText(2000),
  bankDetails: optionalText(1000),
  upiId: z
    .string()
    .trim()
    .max(100)
    .refine((value) => value === "" || /^[\w.-]{2,}@[a-zA-Z][\w.-]{1,}$/.test(value), "Enter a valid UPI ID, e.g. name@bank"),
  /** Also store tax, notes, terms, bank and UPI details as the workspace defaults for new invoices. */
  saveDefaults: z.boolean(),
});

export const invoiceSchema = invoiceFields.superRefine((value, ctx) => {
  if (value.dueDate < value.issueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date can't be before the issue date" });
  if (value.discountType === "percent" && value.discountValue > 10_000) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Discount can't be more than 100%" });
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  amount: moneyMinorSchema.refine((value) => value > 0, "Enter the amount received"),
  date: isoDateSchema,
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(100),
  notes: optionalText(500),
});
export type PaymentInput = z.infer<typeof paymentSchema>;
