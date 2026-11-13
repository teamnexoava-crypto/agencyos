import { z } from "zod";
import { TAX_MODES } from "../constants";
import { optionalText } from "./common";
import { invoicePrefixSchema, phoneSchema } from "./workspace";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Agency profile and branding. Currency is fixed after onboarding (existing amounts would change meaning). */
export const settingsProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your agency name").max(80, "Keep the name under 80 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email").max(254)]),
  phone: phoneSchema,
  website: z
    .string()
    .trim()
    .max(200, "Keep this under 200 characters")
    .refine((value) => value === "" || /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value), "Enter a valid website, e.g. yourstudio.com"),
  address: optionalText(500),
  gstNumber: optionalText(20)
    .toUpperCase()
    .refine((value) => value === "" || GSTIN_REGEX.test(value) || /^[A-Z0-9-]{4,20}$/.test(value), "Enter a valid GSTIN / tax ID"),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
});
export type SettingsProfileInput = z.infer<typeof settingsProfileSchema>;

export const settingsInvoicingSchema = z.object({
  invoicePrefix: invoicePrefixSchema,
  invoiceNextNumber: z.number({ error: "Enter a number" }).int("Use a whole number").min(1, "Must be 1 or more").max(9_999_999, "That number is too large"),
  invoiceDueDays: z.number({ error: "Enter a number of days" }).int("Use whole days").min(0, "Can't be negative").max(365, "Keep it within a year"),
  defaultTaxMode: z.enum(TAX_MODES),
  /** Basis points – 1800 = 18%. */
  defaultTaxRate: z.number({ error: "Enter a rate" }).int().min(0, "Can't be negative").max(10_000, "Can't be more than 100%"),
  // Same limits as on an invoice: "remember these for next time" there must always be saveable here.
  invoiceNotes: optionalText(2000),
  invoiceTerms: optionalText(2000),
  bankDetails: optionalText(1000),
  upiId: z
    .string()
    .trim()
    .max(100)
    .refine((value) => value === "" || /^[\w.-]{2,}@[a-zA-Z][\w.-]{1,}$/.test(value), "Enter a valid UPI ID, e.g. studio@okhdfcbank"),
});
export type SettingsInvoicingInput = z.infer<typeof settingsInvoicingSchema>;

const template = (link: string) =>
  z
    .string()
    .trim()
    .max(600, "Keep the message under 600 characters")
    .refine((value) => value === "" || value.includes(link), `Keep ${link} in the message so the link is included`);

/** "" → use the built-in message. */
export const settingsMessagesSchema = z.object({
  waInvoiceTemplate: template("{invoice_link}"),
  waContractTemplate: template("{contract_link}"),
  waInviteTemplate: template("{invite_link}"),
});
export type SettingsMessagesInput = z.infer<typeof settingsMessagesSchema>;

export const deleteWorkspaceSchema = z.object({ confirmName: z.string() });

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(80) });
export const markReadSchema = z.object({ ids: z.array(z.string().regex(/^[\w-]{1,64}$/)).max(100).optional() });
