import { z } from "zod";
import { idSchema, moneyMinorSchema, optionalText } from "./common";
import { phoneSchema } from "./workspace";

/** Roles that can be handed out. "owner" is never assignable – there is exactly one per workspace. */
export const ASSIGNABLE_ROLES = ["admin", "member"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address").max(200).transform((value) => value.trim().toLowerCase()),
  role: z.enum(ASSIGNABLE_ROLES),
  designation: optionalText(80),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const memberUpdateSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  designation: optionalText(80).optional(),
  phone: phoneSchema.optional(),
  /** Minor units; null clears the value. Owner/admin only. */
  monthlyCost: moneyMinorSchema.nullable().optional(),
  hourlyRate: moneyMinorSchema.nullable().optional(),
});
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

export const switchWorkspaceSchema = z.object({ workspaceId: idSchema });

/** Fills the WhatsApp invite template. Unknown placeholders are left untouched. */
export function renderInviteMessage(template: string, values: { inviter_name: string; agency_name: string; invite_link: string }): string {
  return template.replace(/\{(inviter_name|agency_name|invite_link)\}/g, (_match, key: keyof typeof values) => values[key]);
}
