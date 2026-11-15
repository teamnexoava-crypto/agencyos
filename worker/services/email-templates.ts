/**
 * The emails the app sends by itself. Each one has a single job and a single button, and says plainly
 * what happens next. Prices are in the workspace's own currency.
 */
import { APP_NAME, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_DISPLAY } from "../../shared/constants";
import { PLANS, TIERS, TRIAL_DAYS, TRIAL_PLAN, formatPlanPrice, type BillingCurrency, type PlanId } from "../../shared/plans";

export const EMAIL_KINDS = ["welcome", "trial_2d", "trial_1d", "autopay_upcoming", "trial_ended", "plan_ending", "plan_ended", "payment_failed", "autopay_stopped"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EmailContext {
  /** The owner's first name. */
  firstName: string;
  workspaceName: string;
  /** e.g. "https://growupliftos.com" */
  appUrl: string;
  currency: BillingCurrency;
  /** The plan paid for (or set up for auto-pay), when there is one. */
  plan: PlanId | null;
  /** Amount of the auto-pay charge, in paise or cents. */
  amount?: number | null;
  /** The date the email is about: trial end, paid-until, next charge… */
  date?: Date | null;
  /** What the workspace has made so far, for the trial emails. */
  usage?: { clients: number; activeProjects: number; invoicesThisMonth: number } | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (date: Date | null | undefined) => (date ? new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(date) : "soon");

interface Content {
  subject: string;
  heading: string;
  paragraphs: string[];
  /** A short list shown as bullets. */
  bullets?: string[];
  cta: { label: string; path: string };
}

function contentFor(kind: EmailKind, ctx: EmailContext): Content {
  const growth = formatPlanPrice(PLANS.growth.price[ctx.currency].monthly, ctx.currency);
  const india = ctx.currency === "INR";
  const planName = ctx.plan ? PLANS[ctx.plan].name : TIERS[TRIAL_PLAN].name;
  const price = ctx.plan ? formatPlanPrice(ctx.amount ?? PLANS[ctx.plan].price[ctx.currency].monthly, ctx.currency) : growth;
  const pay = india ? "UPI or card" : "card";
  const madeSoFar = (() => {
    const usage = ctx.usage;
    if (!usage) return null;
    const parts = [
      usage.clients ? `${usage.clients} client${usage.clients === 1 ? "" : "s"}` : null,
      usage.activeProjects ? `${usage.activeProjects} active project${usage.activeProjects === 1 ? "" : "s"}` : null,
      usage.invoicesThisMonth ? `${usage.invoicesThisMonth} invoice${usage.invoicesThisMonth === 1 ? "" : "s"} this month` : null,
    ].filter((part): part is string => part !== null);
    return parts.length ? `So far you've added ${parts.join(", ")} – all of it stays yours.` : null;
  })();
  const lockedOnFree = ["Team members can't sign in", "Client portal links are paused", "No new contracts, expenses or Google Sheet syncs", "Up to 3 active projects, 10 clients and 5 invoices a month"];

  switch (kind) {
    case "welcome":
      return {
        subject: `Welcome to ${APP_NAME} – your ${TRIAL_DAYS} days of Premium start now`,
        heading: `Welcome, ${ctx.firstName}! 👋`,
        paragraphs: [
          `Your workspace “${ctx.workspaceName}” is ready, with every Premium feature unlocked for ${TRIAL_DAYS} days – no card needed.`,
          "The quickest way to see what it can do is to finish one real job end to end:",
        ],
        bullets: ["Add a client and a project with a few milestones", "Send them a GST invoice on WhatsApp (with a UPI QR code)", "Get a contract signed from their phone", "Share the client link so they can follow progress"],
        cta: { label: "Open my workspace", path: "/app" },
      };
    case "trial_2d":
      return {
        subject: `Your ${APP_NAME} Premium trial ends in 2 days`,
        heading: "2 days of Premium left",
        paragraphs: [
          `Hi ${ctx.firstName}, your free Premium trial for “${ctx.workspaceName}” ends on ${day(ctx.date)}.`,
          ...(madeSoFar ? [madeSoFar] : []),
          `To keep your team, contracts, client portal and finance, pick a plan – Growth is ${growth} a month, one flat price for up to 5 people. If you don't, you simply move to the Free plan; nothing is deleted.`,
        ],
        cta: { label: "Choose a plan", path: "/app/billing" },
      };
    case "trial_1d":
      return {
        subject: `Last day of your ${APP_NAME} Premium trial`,
        heading: "Your Premium trial ends tomorrow",
        paragraphs: [
          `Hi ${ctx.firstName}, this is the last day of Premium for “${ctx.workspaceName}”. When the trial ends on ${day(ctx.date)}, it moves to the Free plan, where:`,
        ],
        bullets: lockedOnFree,
        cta: { label: `Keep everything – from ${growth}/month`, path: "/app/billing" },
      };
    case "autopay_upcoming":
      return {
        subject: `Your ${planName} plan starts on ${day(ctx.date)}`,
        heading: `${planName} starts when your trial ends`,
        paragraphs: [
          `Hi ${ctx.firstName}, thanks for setting up auto-pay for “${ctx.workspaceName}”. Your trial ends on ${day(ctx.date)}, and the first payment of ${price} will be taken then by ${pay}, and every month after that.`,
          "Nothing else to do. You can see or turn off auto-pay any time from Billing.",
        ],
        cta: { label: "View billing", path: "/app/billing" },
      };
    case "trial_ended":
      return {
        subject: `Your ${APP_NAME} trial has ended – you're on the Free plan`,
        heading: "You're now on the Free plan",
        paragraphs: [
          `Hi ${ctx.firstName}, the Premium trial for “${ctx.workspaceName}” has ended, so it has moved to the Free plan. Nothing you made has been deleted.`,
          ...(madeSoFar ? [madeSoFar] : []),
          "On the Free plan:",
        ],
        bullets: lockedOnFree,
        cta: { label: `Upgrade – from ${growth}/month`, path: "/app/billing" },
      };
    case "plan_ending":
      return {
        subject: `Your ${planName} plan ends on ${day(ctx.date)}`,
        heading: `Your ${planName} plan ends soon`,
        paragraphs: [
          `Hi ${ctx.firstName}, the ${planName} plan for “${ctx.workspaceName}” is paid until ${day(ctx.date)}. It doesn't renew by itself.`,
          `Renew now to keep your team, contracts and client portal running without a break – any days left are added on, so you lose nothing by paying early.`,
        ],
        cta: { label: "Renew my plan", path: "/app/billing" },
      };
    case "plan_ended":
      return {
        subject: `Your ${planName} plan has ended`,
        heading: "Your workspace is on the Free plan",
        paragraphs: [`Hi ${ctx.firstName}, the ${planName} plan for “${ctx.workspaceName}” has ended, so it has moved to the Free plan. Nothing has been deleted, but:`],
        bullets: lockedOnFree,
        cta: { label: "Renew my plan", path: "/app/billing" },
      };
    case "payment_failed":
      return {
        subject: `We couldn't take your ${APP_NAME} payment`,
        heading: "Your payment didn't go through",
        paragraphs: [
          `Hi ${ctx.firstName}, the auto-pay charge of ${price} for “${ctx.workspaceName}” failed – usually because of a low balance or an expired card.`,
          `${india ? "Razorpay" : "Dodo Payments"} will try again over the next few days${india ? " (look for a request in your UPI app)" : ""}. Your plan keeps working meanwhile. To avoid any interruption, you can also pay for a month right now from Billing.`,
        ],
        cta: { label: "Pay now", path: "/app/billing" },
      };
    case "autopay_stopped":
      return {
        subject: `Auto-pay for ${APP_NAME} has stopped`,
        heading: "Auto-pay has stopped",
        paragraphs: [
          `Hi ${ctx.firstName}, auto-pay for “${ctx.workspaceName}” has stopped – the payment kept failing or the mandate was paused. Your plan runs until ${day(ctx.date)}.`,
          "Choose your plan again in Billing to restart auto-pay, or pay for a month or a year in one go.",
        ],
        cta: { label: "Fix billing", path: "/app/billing" },
      };
  }
}

/** The email for `kind`, as HTML (works in Gmail and Outlook) and as plain text. */
export function renderEmail(kind: EmailKind, ctx: EmailContext): RenderedEmail {
  const content = contentFor(kind, ctx);
  const url = `${ctx.appUrl}${content.cta.path}`;
  const whatsapp = `https://wa.me/${SUPPORT_WHATSAPP}`;
  const footer = `You're receiving this because you own the “${ctx.workspaceName}” workspace on ${APP_NAME}. Questions? Message us on WhatsApp: ${SUPPORT_WHATSAPP_DISPLAY}.`;

  const paragraphs = content.paragraphs.map((text) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3a3f52">${escape(text)}</p>`).join("");
  const bullets = content.bullets?.length
    ? `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.7;color:#3a3f52">${content.bullets.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d29">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e7ef;border-radius:16px">
<tr><td style="padding:26px 28px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:30px;height:30px;border-radius:8px;background:#5b4cf0;color:#ffffff;font-weight:700;font-size:16px;text-align:center;line-height:30px">G</td>
<td style="padding-left:10px;font-weight:700;font-size:16px;color:#1a1d29">${APP_NAME}</td></tr></table></td></tr>
<tr><td style="padding:22px 28px 6px"><h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:#1a1d29">${escape(content.heading)}</h1>${paragraphs}${bullets}</td></tr>
<tr><td style="padding:4px 28px 30px"><a href="${escape(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escape(content.cta.label)}</a></td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#7a7f91">You're receiving this because you own the “${escape(ctx.workspaceName)}” workspace on ${APP_NAME}. Questions? Message us on <a href="${whatsapp}" style="color:#4f46e5">WhatsApp (${SUPPORT_WHATSAPP_DISPLAY})</a>.</p>
</td></tr></table></body></html>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.bullets?.length ? [...content.bullets.map((item) => `• ${item}`), ""] : []),
    `${content.cta.label}: ${url}`,
    "",
    "—",
    footer,
  ].join("\n");

  return { subject: content.subject, html, text };
}
