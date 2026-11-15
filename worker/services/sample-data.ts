/**
 * Sample data: a small, believable agency – clients, projects with milestones and tasks, invoices in
 * every state, a contract out for signature, a client portal with a message, leads and expenses – so a
 * new workspace shows what each screen is for. Every row is marked `isSample` and removed together.
 * Sample rows don't count towards plan limits (see `usageOf` and the limit checks in billing.ts).
 */
import { and, eq } from "drizzle-orm";
import { STARTER_TEMPLATE_HTML, fillContractVariables } from "../../shared/contract";
import { computeInvoiceTotals } from "../../shared/invoice";
import { formatInvoiceNumber } from "../../shared/schemas/workspace";
import type { Database } from "../db";
import { clients, comments, contracts, expenseCategories, expenses, invoiceItems, invoices, leadNotes, leads, payments, projectSteps, projects, shareLinks, tasks, workspaces } from "../db/schema";
import { ApiError } from "../lib/errors";
import { newPublicToken } from "../lib/ids";
import type { WorkspaceRow } from "../types";
import { formatIndianDate } from "../../shared/dates";

const DAY_MS = 86_400_000;
/** YYYY-MM-DD, `days` from today, so deadlines always look current. */
const day = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

const CLIENTS = [
  { key: "bloom", name: "Riya Sen", company: "Bloom Cafe (sample)", email: "riya@example.com", whatsapp: "+91 90000 00001", gstNumber: "07AAACB1234C1Z2", address: "12 Hauz Khas Village\nNew Delhi – 110016", notes: "Sample client. Prefers WhatsApp, pays on time." },
  { key: "kiran", name: "Arjun Nair", company: "Kiran Logistics (sample)", email: "arjun@example.com", whatsapp: "+91 90000 00002", gstNumber: "32AABCK5678D1Z9", address: "Infopark Phase 1\nKochi, Kerala – 682042", notes: "Sample client." },
  { key: "zenfit", name: "Meera Iyer", company: "ZenFit Studio (sample)", email: "meera@example.com", whatsapp: "+91 90000 00003", gstNumber: null, address: null, notes: "Sample client. Opening a second branch soon." },
] as const;
type ClientKey = (typeof CLIENTS)[number]["key"];

type StepSeed = [title: string, status: "pending" | "in_progress" | "completed", dueInDays: number, amount: number | null];
type TaskSeed = [title: string, done: boolean, dueInDays: number | null, notes?: string];

const PROJECTS: { key: string; title: string; client: ClientKey | null; status: "lead" | "in_progress" | "completed"; priority: "low" | "medium" | "high" | "urgent"; start: number | null; due: number | null; budget: number; tags: string[]; description: string; steps: StepSeed[]; tasks: TaskSeed[] }[] = [
  {
    key: "web",
    title: "Bloom Cafe – website redesign",
    client: "bloom",
    status: "in_progress",
    priority: "high",
    start: -30,
    due: 18,
    budget: 2_40_000_00,
    tags: ["web", "design"],
    description: "Sample project. New website with online table booking and a menu the cafe team can edit themselves.",
    steps: [["Discovery & sitemap", "completed", -22, 30_000_00], ["Visual design", "completed", -8, 70_000_00], ["Website build", "in_progress", 6, 90_000_00], ["Launch & handover", "pending", 18, 50_000_00]],
    tasks: [
      ["Collect logo and photos from Riya", true, -20],
      ["Set up the staging website", false, -1, "Share the staging link with Riya on WhatsApp once it's up."],
      ["Write the booking confirmation message", false, 0],
      ["Check every page on a phone", false, 5],
    ],
  },
  {
    key: "app",
    title: "Kiran Logistics – driver app",
    client: "kiran",
    status: "in_progress",
    priority: "urgent",
    start: -45,
    due: 9,
    budget: 3_50_000_00,
    tags: ["mobile"],
    description: "Sample project. Android app for delivery partners: route list, proof of delivery and offline mode.",
    steps: [["Requirements workshop", "completed", -40, 50_000_00], ["Clickable prototype", "completed", -28, 1_00_000_00], ["App build", "in_progress", 2, 2_00_000_00]],
    tasks: [["Signature capture screen", true, -6], ["Offline mode for deliveries", false, 3], ["Play Store listing text", false, 8]],
  },
  {
    key: "brand",
    title: "ZenFit – brand identity",
    client: "zenfit",
    status: "completed",
    priority: "medium",
    start: -90,
    due: -20,
    budget: 1_20_000_00,
    tags: ["branding"],
    description: "Sample project. Logo, colours, fonts and a starter kit of Instagram templates. Finished and paid.",
    steps: [["Moodboards", "completed", -75, 20_000_00], ["Logo concepts", "completed", -55, 50_000_00], ["Brand guidelines", "completed", -25, 50_000_00]],
    tasks: [["Export the logo pack", true, -24], ["Hand over Canva templates", true, -21]],
  },
  {
    key: "portal",
    title: "ZenFit – membership website",
    client: "zenfit",
    status: "lead",
    priority: "medium",
    start: null,
    due: 60,
    budget: 3_80_000_00,
    tags: ["web"],
    description: "Sample project. Members book classes and pay online. Quote sent – waiting for a yes.",
    steps: [["Proposal & estimate", "completed", -3, null], ["Kick-off call", "pending", 7, null]],
    tasks: [["Follow up with Meera on the quote", false, 1]],
  },
];

type PaymentSeed = [amount: number, daysAgo: number, method: "upi" | "bank_transfer" | "card"];
/** Paid, part-paid, overdue, sent and draft – one of each kind of invoice. */
const INVOICES: { client: ClientKey; project: string | null; issuedDaysAgo: number; dueInDays: number; lines: [string, number, number][]; taxMode: "none" | "cgst_sgst" | "igst"; status: "draft" | "sent" | "viewed"; payments: PaymentSeed[] }[] = [
  { client: "zenfit", project: "brand", issuedDaysAgo: 60, dueInDays: 15, lines: [["Brand identity – complete", 1, 1_20_000_00]], taxMode: "igst", status: "viewed", payments: [[1_41_600_00, 48, "upi"]] },
  { client: "bloom", project: "web", issuedDaysAgo: 40, dueInDays: 15, lines: [["Discovery & sitemap", 1, 30_000_00], ["Visual design", 1, 70_000_00]], taxMode: "cgst_sgst", status: "viewed", payments: [[1_18_000_00, 30, "upi"]] },
  { client: "kiran", project: "app", issuedDaysAgo: 30, dueInDays: 15, lines: [["Requirements workshop", 1, 50_000_00], ["Clickable prototype", 1, 1_00_000_00]], taxMode: "igst", status: "viewed", payments: [[1_00_000_00, 12, "bank_transfer"]] },
  { client: "bloom", project: "web", issuedDaysAgo: 25, dueInDays: 10, lines: [["Hosting & domain – 1 year", 1, 12_000_00]], taxMode: "cgst_sgst", status: "viewed", payments: [] },
  { client: "bloom", project: "web", issuedDaysAgo: 3, dueInDays: 15, lines: [["Website build – milestone 3", 1, 90_000_00]], taxMode: "cgst_sgst", status: "sent", payments: [] },
  { client: "zenfit", project: "portal", issuedDaysAgo: 0, dueInDays: 15, lines: [["Membership website – advance (30%)", 1, 1_14_000_00]], taxMode: "igst", status: "draft", payments: [] },
];

const EXPENSES: [description: string, category: string, amount: number, daysAgo: number, project: string | null, vendor: string][] = [
  ["Design & dev tools", "Software", 8_400_00, 32, null, "Figma, GitHub"],
  ["Menu photo shoot", "Freelancers", 12_000_00, 26, "web", "Lens & Light"],
  ["Android test phone", "Office", 14_500_00, 20, "app", "Croma"],
  ["Instagram ads", "Marketing", 6_000_00, 10, null, "Meta"],
  ["Design & dev tools", "Software", 8_400_00, 2, null, "Figma, GitHub"],
];

const LEADS: [name: string, company: string | null, phone: string, email: string | null, stage: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost", value: number | null, followUpIn: number | null, source: string][] = [
  ["Rohan Verma", "Verma Sweets (sample)", "+91 90000 00011", "rohan@example.com", "new", 60_000_00, 0, "Website form"],
  ["Sneha Iyer", "Iyer Yoga Studio (sample)", "+91 90000 00012", null, "contacted", 45_000_00, 2, "Instagram"],
  ["Farah Khan", "Khan Interiors (sample)", "+91 90000 00013", "farah@example.com", "qualified", 2_50_000_00, 3, "Referral"],
  ["Vikram Rao", "Rao Logistics (sample)", "+91 90000 00014", "vikram@example.com", "proposal", 4_50_000_00, -1, "LinkedIn"],
  ["Meera Joshi", "Joshi Bakes (sample)", "+91 90000 00015", null, "won", 80_000_00, null, "Referral"],
];

/**
 * Sample amounts are written in rupees; a workspace that invoices in another currency gets roughly the
 * same value in its own money (rounded), so the numbers still look sensible.
 */
function moneyIn(currency: string): (inr: number) => number {
  if (currency === "INR") return (amount) => amount;
  const rate = currency === "USD" ? 85 : currency === "EUR" ? 92 : currency === "GBP" ? 108 : currency === "AED" ? 23 : currency === "AUD" ? 56 : currency === "CAD" ? 62 : 85;
  return (amount) => Math.max(100, Math.round(amount / rate / 1000) * 1000);
}

/** Adds the sample data to a workspace. Refuses if it is already there. */
export async function addSampleData(db: Database, ws: WorkspaceRow, ownerMemberId: string): Promise<void> {
  if (ws.sampleDataAt) throw new ApiError(409, "conflict", "Sample data is already in this workspace.");
  const money = moneyIn(ws.currency);
  const sample = { workspaceId: ws.id, isSample: true } as const;

  await db.transaction(async (tx) => {
    const clientIds = new Map<string, string>();
    for (const { key, ...client } of CLIENTS) {
      const [row] = await tx.insert(clients).values({ ...sample, ...client }).returning({ id: clients.id });
      if (row) clientIds.set(key, row.id);
    }

    const projectIds = new Map<string, string>();
    for (const [position, seed] of PROJECTS.entries()) {
      const [project] = await tx
        .insert(projects)
        .values({
          ...sample,
          clientId: seed.client ? (clientIds.get(seed.client) ?? null) : null,
          title: seed.title,
          description: seed.description,
          startDate: seed.start === null ? null : day(seed.start),
          dueDate: seed.due === null ? null : day(seed.due),
          budget: money(seed.budget),
          status: seed.status,
          priority: seed.priority,
          tags: seed.tags,
          position,
          createdBy: ownerMemberId,
        })
        .returning({ id: projects.id });
      if (!project) throw new Error("Could not add a sample project");
      projectIds.set(seed.key, project.id);
      if (seed.steps.length) {
        await tx.insert(projectSteps).values(
          seed.steps.map(([title, status, due, amount], index) => ({
            workspaceId: ws.id,
            projectId: project.id,
            title,
            status,
            dueDate: day(due),
            amount: amount === null ? null : money(amount),
            assigneeId: ownerMemberId,
            position: index,
            completedAt: status === "completed" ? new Date(Date.now() + due * DAY_MS) : null,
          })),
        );
      }
      if (seed.tasks.length) {
        await tx.insert(tasks).values(
          seed.tasks.map(([title, done, due, notes], index) => ({
            workspaceId: ws.id,
            projectId: project.id,
            title,
            description: notes ?? null,
            done,
            doneAt: done ? new Date() : null,
            dueDate: due === null ? null : day(due),
            assigneeId: ownerMemberId,
            position: index,
            createdBy: ownerMemberId,
          })),
        );
      }
    }

    for (const [index, seed] of INVOICES.entries()) {
      const items = seed.lines.map(([description, quantity, rate]) => ({ description, quantity, rate: money(rate) }));
      const taxMode = ws.currency === "INR" ? seed.taxMode : "none";
      const totals = computeInvoiceTotals({ items, discountType: "none", discountValue: 0, taxMode, taxRate: 1800 });
      // Payments are given in rupees including tax; scale them to the invoice's own total.
      const paidShare = seed.payments.map(([amount]) => amount).reduce((sum, amount) => sum + amount, 0);
      const inrTotal = computeInvoiceTotals({ items: seed.lines.map(([description, quantity, rate]) => ({ description, quantity, rate })), discountType: "none", discountValue: 0, taxMode: seed.taxMode, taxRate: 1800 }).total;
      const amountPaid = paidShare === 0 ? 0 : paidShare >= inrTotal ? totals.total : Math.round((totals.total * paidShare) / inrTotal);
      const issuedAt = new Date(Date.now() - seed.issuedDaysAgo * DAY_MS);
      const status = amountPaid >= totals.total ? "paid" : amountPaid > 0 ? "partially_paid" : seed.status;
      const [invoice] = await tx
        .insert(invoices)
        .values({
          ...sample,
          clientId: clientIds.get(seed.client) ?? null,
          projectId: seed.project ? (projectIds.get(seed.project) ?? null) : null,
          // Its own numbering, so real invoices keep the workspace's sequence from 1.
          number: formatInvoiceNumber("SAMPLE", index + 1),
          sequence: 0,
          status,
          issueDate: day(-seed.issuedDaysAgo),
          dueDate: day(-seed.issuedDaysAgo + seed.dueInDays),
          currency: ws.currency,
          taxMode,
          taxRate: taxMode === "none" ? 0 : 1800,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          amountPaid,
          terms: "Payment due within 15 days.",
          notes: "This is a sample invoice.",
          bankDetails: ws.bankDetails,
          upiId: ws.upiId,
          publicToken: newPublicToken(),
          sentAt: seed.status === "draft" ? null : issuedAt,
          viewedAt: seed.status === "viewed" ? new Date(issuedAt.getTime() + 3_600_000) : null,
          paidAt: status === "paid" ? new Date(Date.now() - (seed.payments.at(-1)?.[1] ?? 0) * DAY_MS) : null,
          createdBy: ownerMemberId,
          createdAt: issuedAt,
        })
        .returning({ id: invoices.id });
      if (!invoice) throw new Error("Could not add a sample invoice");
      await tx.insert(invoiceItems).values(items.map((item, position) => ({ workspaceId: ws.id, invoiceId: invoice.id, ...item, amount: totals.lineAmounts[position] ?? 0, position })));
      if (amountPaid > 0) {
        const [first] = seed.payments;
        await tx.insert(payments).values({ workspaceId: ws.id, invoiceId: invoice.id, amount: amountPaid, date: day(-(first?.[1] ?? 0)), method: first?.[2] ?? "upi", createdBy: ownerMemberId });
      }
    }

    const categories = await tx.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.workspaceId, ws.id));
    await tx.insert(expenses).values(
      EXPENSES.map(([description, category, amount, daysAgo, project, vendor]) => ({
        ...sample,
        description,
        categoryId: categories.find((row) => row.name === category)?.id ?? null,
        amount: money(amount),
        date: day(-daysAgo),
        projectId: project ? (projectIds.get(project) ?? null) : null,
        vendor,
        createdBy: ownerMemberId,
      })),
    );

    // A contract out for signature (open its link to try signing as the client) and a draft.
    const longDay = (iso: string | null) => (iso ? formatIndianDate(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
    for (const [key, sent] of [["portal", true], ["app", false]] as const) {
      const seed = PROJECTS.find((item) => item.key === key);
      const client = CLIENTS.find((item) => item.key === seed?.client);
      if (!seed || !client) continue;
      await tx.insert(contracts).values({
        ...sample,
        clientId: clientIds.get(client.key) ?? null,
        projectId: projectIds.get(key) ?? null,
        title: `${seed.title} – service agreement`,
        content: fillContractVariables(STARTER_TEMPLATE_HTML, {
          client_name: client.name,
          client_company: client.company,
          project_title: seed.title,
          amount: new Intl.NumberFormat("en-IN", { style: "currency", currency: ws.currency, maximumFractionDigits: 0 }).format(money(seed.budget) / 100),
          start_date: longDay(seed.start === null ? day(7) : day(seed.start)),
          due_date: longDay(seed.due === null ? null : day(seed.due)),
          agency_name: ws.name,
          today: longDay(day(0)),
        }),
        status: sent ? "sent" : "draft",
        sentAt: sent ? new Date() : null,
        publicToken: newPublicToken(),
        createdBy: ownerMemberId,
      });
    }

    // The client portal is switched on for the website project, with a message from the client.
    const webId = projectIds.get("web");
    if (webId) {
      await tx.insert(shareLinks).values({ workspaceId: ws.id, projectId: webId, token: newPublicToken() });
      await tx.insert(comments).values({ workspaceId: ws.id, projectId: webId, authorType: "client", authorName: "Riya", body: "Loving the new design! When can we see the booking page?" });
    }

    for (const [name, company, phone, email, stage, value, followUpIn, sourceLabel] of LEADS) {
      const [lead] = await tx
        .insert(leads)
        .values({
          ...sample,
          name,
          company,
          phone,
          email,
          stage,
          value: value === null ? null : money(value),
          sourceLabel,
          followUpDate: followUpIn === null ? null : day(followUpIn),
          assigneeId: ownerMemberId,
          closedAt: stage === "won" || stage === "lost" ? new Date() : null,
          createdBy: ownerMemberId,
        })
        .returning({ id: leads.id });
      if (!lead) continue;
      await tx.insert(leadNotes).values({ workspaceId: ws.id, leadId: lead.id, kind: "system", body: "Sample lead added", authorName: "GrowUpliftOS", authorMemberId: null });
      if (stage !== "new") await tx.insert(leadNotes).values({ workspaceId: ws.id, leadId: lead.id, kind: "call", body: "First call done. They want a quote and a rough timeline.", authorName: "GrowUpliftOS", authorMemberId: null });
    }

    await tx.update(workspaces).set({ sampleDataAt: new Date() }).where(eq(workspaces.id, ws.id));
  });
}

/**
 * Removes every sample row (and what belongs to it: milestones, tasks, invoice lines and payments,
 * signatures, portal link, lead notes). Real records that pointed at a sample client or project keep
 * working, just without that link.
 */
export async function removeSampleData(db: Database, workspaceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const sample = <T extends typeof invoices | typeof contracts | typeof expenses | typeof leads | typeof projects | typeof clients>(table: T) =>
      and(eq(table.workspaceId, workspaceId), eq(table.isSample, true));
    await tx.delete(invoices).where(sample(invoices));
    await tx.delete(contracts).where(sample(contracts));
    await tx.delete(expenses).where(sample(expenses));
    await tx.delete(leads).where(sample(leads));
    await tx.delete(projects).where(sample(projects));
    await tx.delete(clients).where(sample(clients));
    await tx.update(workspaces).set({ sampleDataAt: null }).where(eq(workspaces.id, workspaceId));
  });
}
