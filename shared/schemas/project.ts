import { z } from "zod";
import { PROJECT_PRIORITIES, PROJECT_STATUSES, STEP_STATUSES } from "../constants";
import { idSchema, moneyMinorSchema, optionalIdSchema, optionalIsoDateSchema, optionalText } from "./common";

const tagSchema = z.string().trim().min(1).max(24, "Keep tags under 24 characters");

const projectFields = z.object({
  title: z.string().trim().min(2, "Give the project a title").max(140, "Keep the title under 140 characters"),
  clientId: optionalIdSchema,
  description: optionalText(5000),
  startDate: optionalIsoDateSchema,
  dueDate: optionalIsoDateSchema,
  /** Minor units. */
  budget: moneyMinorSchema,
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PROJECT_PRIORITIES),
  tags: z.array(tagSchema).max(10, "Use up to 10 tags"),
  /** workspace_members ids assigned to the project. */
  memberIds: z.array(idSchema).max(50),
});

function checkDateOrder(value: { startDate?: string; dueDate?: string }, ctx: z.RefinementCtx) {
  if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date can't be before the start date" });
  }
}

export const projectSchema = projectFields.superRefine(checkDateOrder);
export type ProjectInput = z.infer<typeof projectSchema>;

export const projectUpdateSchema = projectFields.partial().superRefine(checkDateOrder);
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

/** Kanban drop: the card's new status plus the full order of its destination column. */
export const moveProjectSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
  orderedIds: z.array(idSchema).min(1).max(500),
});
export type MoveProjectInput = z.infer<typeof moveProjectSchema>;

export const projectMembersSchema = z.object({ memberIds: z.array(idSchema).max(50) });
export type ProjectMembersInput = z.infer<typeof projectMembersSchema>;

export const stepSchema = z.object({
  title: z.string().trim().min(1, "Give the step a title").max(140, "Keep the title under 140 characters"),
  description: optionalText(2000),
  dueDate: optionalIsoDateSchema,
  status: z.enum(STEP_STATUSES),
  assigneeId: optionalIdSchema,
  /** Optional milestone amount in minor units; null = no amount. */
  amount: moneyMinorSchema.nullable(),
});
export type StepInput = z.infer<typeof stepSchema>;

export const stepUpdateSchema = stepSchema.partial();
export type StepUpdateInput = z.infer<typeof stepUpdateSchema>;

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Describe the task").max(200, "Keep the task under 200 characters"),
  assigneeId: optionalIdSchema,
  dueDate: optionalIsoDateSchema,
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskUpdateSchema = taskSchema.partial().extend({ done: z.boolean().optional() });
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
