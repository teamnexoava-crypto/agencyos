import { z } from "zod";
import { LEAD_MAP_FIELDS, LEAD_NOTE_KINDS, LEAD_STAGES } from "../constants";
import { moneyMinorSchema, optionalIdSchema, optionalIsoDateSchema, optionalText } from "./common";
import { phoneSchema } from "./workspace";

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120, "Keep the name under 120 characters"),
  company: optionalText(120),
  email: z.union([z.literal(""), z.email("Enter a valid email").max(254)]),
  phone: phoneSchema,
  /** Where the lead came from, e.g. "Referral", "Instagram". */
  sourceLabel: optionalText(80),
  stage: z.enum(LEAD_STAGES),
  /** Expected deal value in minor units; `null` when not set. */
  value: moneyMinorSchema.nullable(),
  assigneeId: optionalIdSchema,
  followUpDate: optionalIsoDateSchema,
});
export type LeadInput = z.infer<typeof leadSchema>;

/** Any subset of the lead's fields (stage changes from the board, a new follow-up date, …). */
export const leadUpdateSchema = leadSchema.partial();
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

/** People can write every kind except "system", which the app writes itself. */
export const leadNoteSchema = z.object({
  kind: z.enum(LEAD_NOTE_KINDS).exclude(["system"]),
  body: z.string().trim().min(1, "Write a note").max(4000, "Keep it under 4,000 characters"),
});
export type LeadNoteInput = z.infer<typeof leadNoteSchema>;

const sheetUrlSchema = z.string().trim().min(1, "Paste the link to your Google Sheet").max(600, "That link is too long");
const mappingSchema = z
  .object(Object.fromEntries(LEAD_MAP_FIELDS.map((field) => [field, z.string().max(200).optional()])) as Record<(typeof LEAD_MAP_FIELDS)[number], z.ZodOptional<z.ZodString>>)
  .refine((mapping) => Boolean(mapping.name || mapping.phone || mapping.email), "Choose the column that holds the name, phone or email");

export const sheetPreviewSchema = z.object({ url: sheetUrlSchema });
export const leadSourceSchema = z.object({
  name: z.string().trim().min(1, "Name this sheet").max(80, "Keep the name under 80 characters"),
  url: sheetUrlSchema,
  mapping: mappingSchema,
});
export type LeadSourceInput = z.infer<typeof leadSourceSchema>;

export const leadSourceUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name this sheet").max(80, "Keep the name under 80 characters"),
  mapping: mappingSchema,
});
export type LeadSourceUpdateInput = z.infer<typeof leadSourceUpdateSchema>;
