import { z } from "zod";

/** Project files: generous enough for design exports and PDFs, small enough to buffer in a Worker. */
export const PROJECT_FILE_MAX_BYTES = 20 * 1024 * 1024;
/** What the file picker offers. The server decides the real type from the file's first bytes. */
export const PROJECT_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,.md,.mp4,.mov,.psd,.ai,.fig";

export const shareLinkSchema = z.object({
  enabled: z.boolean(),
  showInvoices: z.boolean(),
  showContract: z.boolean(),
  showFiles: z.boolean(),
  allowComments: z.boolean(),
});
export type ShareLinkInput = z.infer<typeof shareLinkSchema>;

export const fileShareSchema = z.object({ sharedWithClient: z.boolean() });

const commentBody = z.string().trim().min(1, "Write a message").max(2000, "Keep it under 2,000 characters");

/** Reply from the team. */
export const commentSchema = z.object({ body: commentBody });
export type CommentInput = z.infer<typeof commentSchema>;

/** Message left by the client on the portal. */
export const portalCommentSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Keep the name under 80 characters"),
  body: commentBody,
});
export type PortalCommentInput = z.infer<typeof portalCommentSchema>;
