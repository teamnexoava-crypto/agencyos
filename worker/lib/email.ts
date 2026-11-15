/**
 * Sending email through Resend (https://resend.com). Only used for messages the app sends by itself:
 * welcome, trial and plan reminders, and failed payments. Until `RESEND_API_KEY` is set, nothing is
 * sent and the reminders simply wait.
 */

export const isEmailConfigured = (env: Env): boolean => Boolean(env.RESEND_API_KEY?.trim());

/** "GrowUpliftOS <hello@growupliftos.com>" unless EMAIL_FROM says otherwise. The domain must be verified in Resend. */
export const emailFrom = (env: Env): string => env.EMAIL_FROM?.trim() || "GrowUpliftOS <hello@growupliftos.com>";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The same key never sends twice within a day, even if a request is retried. */
  idempotencyKey: string;
  /** Short labels shown in Resend's dashboard. */
  tags?: { name: string; value: string }[];
}

export class EmailError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Sends one email and returns the provider's id for it. Throws `EmailError` if it was not accepted. */
export async function sendEmail(env: Env, email: OutgoingEmail): Promise<string> {
  // Local development only: tests talk to a stub instead of Resend.
  const origin = import.meta.env.DEV && env.EMAIL_TEST_ORIGIN ? env.EMAIL_TEST_ORIGIN : "https://api.resend.com";
  let response: Response;
  try {
    response = await fetch(`${origin}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: emailFrom(env), to: [email.to], subject: email.subject, html: email.html, text: email.text, tags: email.tags }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new EmailError(0, `Email provider unreachable: ${String(error)}`);
  }
  if (!response.ok) {
    // The body explains the problem (e.g. an unverified domain); it never contains our key.
    throw new EmailError(response.status, (await response.text()).slice(0, 300));
  }
  const body = (await response.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : "";
}
