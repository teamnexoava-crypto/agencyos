import { nanoid } from "nanoid";

/** Primary-key IDs: 21-char nanoid (~126 bits of entropy). */
export const newId = (): string => nanoid(21);

/** Public, unguessable link tokens (/i/:token, /c/:token, /p/:token, invites): 32 chars (~190 bits). */
export const newPublicToken = (): string => nanoid(32);
