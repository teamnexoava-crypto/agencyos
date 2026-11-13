/**
 * Seeds the LOCAL Postgres database (DATABASE_URL) with a demo workspace so the app has something to show.
 *
 *   npm run db:migrate:local   # once
 *   npm run db:seed            # re-runnable: wipes and recreates the demo workspace
 *
 * Then start `npm run dev` and click "Continue as demo user" on /login.
 * Each build phase extends this file with data for the features it adds.
 */
import { eq, inArray } from "drizzle-orm";
import { createDb } from "../worker/db";
import { STARTER_TEMPLATE_HTML, STARTER_TEMPLATE_NAME, fillContractVariables } from "../shared/contract";
import { computeInvoiceTotals } from "../shared/invoice";
import { formatInvoiceNumber } from "../shared/schemas/workspace";
import { clients, comments, contractTemplates, contracts, expenseCategories, leadNotes, leads, expenses, invoiceItems, invoices, payments, projectMembers, projectSteps, projects, shareLinks, tasks, users, workspaceMembers, workspaces } from "../worker/db/schema";
import { newPublicToken } from "../worker/lib/ids";
import { createWorkspaceForUser } from "../worker/services/workspaces";
import { isLocalDatabase, localDatabaseUrl } from "./env";

const DEMO_WORKSPACE_ID = "demo_workspace";

/** Must match the identity used by POST /api/auth/dev-login (worker/routes/auth.ts). */
const DEMO_OWNER = { googleSub: "dev:demo", email: "demo@agencyos.local", name: "Demo Owner" };

/** YYYY-MM-DD, `days` from today – keeps the demo deadlines fresh whenever the seed is run. */
function day(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const CLIENTS = [
  { key: "bloom", name: "Riya Sen", company: "Bloom Cafe", email: "riya@bloomcafe.in", whatsapp: "+91 98111 22334", gstNumber: "07AAACB1234C1Z2", address: "12 Hauz Khas Village\nNew Delhi – 110016", notes: "Prefers WhatsApp. Pays on time." },
  { key: "kiran", name: "Arjun Nair", company: "Kiran Logistics", email: "arjun@kiranlogistics.com", whatsapp: "+91 99000 11223", gstNumber: "32AABCK5678D1Z9", address: "Infopark Phase 1\nKochi, Kerala – 682042", notes: null },
  { key: "zenfit", name: "Meera Iyer", company: "ZenFit Studio", email: "meera@zenfit.studio", whatsapp: "+91 98450 77889", gstNumber: null, address: null, notes: "Launching a second branch in March." },
  { key: "pixel", name: "Dev Malhotra", company: "Pixel Pantry", email: "dev@pixelpantry.co", whatsapp: null, gstNumber: null, address: null, notes: null },
] as const;

type StepSeed = [title: string, status: "pending" | "in_progress" | "completed", dueInDays: number, amount: number | null, assignee?: string];
type TaskSeed = [title: string, done: boolean, dueInDays: number | null, assignee?: string];

interface ProjectSeed {
  title: string;
  client: (typeof CLIENTS)[number]["key"] | null;
  status: "lead" | "in_progress" | "on_hold" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  start: number | null;
  due: number | null;
  budget: number;
  tags: string[];
  team: string[];
  description: string;
  steps: StepSeed[];
  tasks: TaskSeed[];
}

const PROJECTS: ProjectSeed[] = [
  {
    title: "Bloom Cafe – website redesign", client: "bloom", status: "in_progress", priority: "high", start: -30, due: 18, budget: 2_40_000_00,
    tags: ["web", "design"], team: ["Diya Kapoor", "Kabir Rao"],
    description: "New marketing site with online table booking and a seasonal menu the cafe team can edit themselves.",
    steps: [["Discovery & sitemap", "completed", -22, 30_000_00, "Diya Kapoor"], ["Visual design", "completed", -8, 70_000_00, "Diya Kapoor"], ["Front-end build", "in_progress", 6, 90_000_00, "Kabir Rao"], ["Booking integration", "pending", 12, 30_000_00, "Kabir Rao"], ["Launch & handover", "pending", 18, 20_000_00]],
    tasks: [["Collect brand assets from Riya", true, -20, "Diya Kapoor"], ["Menu photography shortlist", true, -9, "Diya Kapoor"], ["Set up staging site", false, 2, "Kabir Rao"], ["Write booking confirmation emails", false, 9], ["Mobile QA pass", false, 14, "Kabir Rao"]],
  },
  {
    title: "Kiran Logistics – driver app", client: "kiran", status: "in_progress", priority: "urgent", start: -45, due: 4, budget: 6_50_000_00,
    tags: ["mobile", "react-native"], team: ["Kabir Rao", "Aarav Mehta"],
    description: "Android app for delivery partners: route list, proof of delivery and offline sync.",
    steps: [["Requirements workshop", "completed", -40, 50_000_00, "Aarav Mehta"], ["Clickable prototype", "completed", -28, 1_00_000_00], ["Core app build", "in_progress", -2, 3_50_000_00, "Kabir Rao"], ["Pilot with 20 drivers", "pending", 4, 1_50_000_00, "Aarav Mehta"]],
    tasks: [["Offline queue for deliveries", false, -1, "Kabir Rao"], ["Play Store listing copy", false, 3, "Aarav Mehta"], ["Signature capture screen", true, -6, "Kabir Rao"]],
  },
  {
    title: "ZenFit – brand identity", client: "zenfit", status: "completed", priority: "medium", start: -90, due: -20, budget: 1_20_000_00,
    tags: ["branding"], team: ["Diya Kapoor"],
    description: "Logo, colour system, typography and a starter kit of social templates.",
    steps: [["Moodboards", "completed", -75, 20_000_00, "Diya Kapoor"], ["Logo concepts", "completed", -55, 50_000_00, "Diya Kapoor"], ["Brand guidelines", "completed", -25, 50_000_00, "Diya Kapoor"]],
    tasks: [["Export logo pack", true, -24, "Diya Kapoor"], ["Hand over Canva templates", true, -21, "Diya Kapoor"]],
  },
  {
    title: "ZenFit – membership portal", client: "zenfit", status: "lead", priority: "medium", start: null, due: 60, budget: 3_80_000_00,
    tags: ["web", "payments"], team: [],
    description: "Members book classes, pause plans and pay online. Proposal sent, waiting for sign-off.",
    steps: [["Proposal & estimate", "completed", -3, null, "Aarav Mehta"], ["Kick-off call", "pending", 7, null]],
    tasks: [["Follow up with Meera on proposal", false, 1, "Aarav Mehta"]],
  },
  {
    title: "Pixel Pantry – SEO retainer", client: "pixel", status: "on_hold", priority: "low", start: -60, due: null, budget: 45_000_00,
    tags: ["seo", "retainer"], team: ["Aarav Mehta"],
    description: "Monthly technical SEO and content brief. Paused until the client's replatform is finished.",
    steps: [["Technical audit", "completed", -50, 15_000_00, "Aarav Mehta"], ["Keyword map", "in_progress", -10, 15_000_00], ["Monthly reporting", "pending", 30, 15_000_00]],
    tasks: [["Resume once new site is live", false, null]],
  },
  {
    title: "Internal – agency website refresh", client: null, status: "in_progress", priority: "low", start: -14, due: 40, budget: 0,
    tags: ["internal"], team: ["Diya Kapoor", "Kabir Rao", "Aarav Mehta"],
    description: "New case studies and a faster homepage.",
    steps: [["Case study outlines", "in_progress", 10, null, "Aarav Mehta"], ["Homepage redesign", "pending", 25, null, "Diya Kapoor"]],
    tasks: [["Pick 3 projects to feature", true, -5, "Aarav Mehta"], ["Request testimonials", false, 6, "Aarav Mehta"]],
  },
  {
    title: "Bloom Cafe – festive campaign", client: "bloom", status: "cancelled", priority: "medium", start: -40, due: -10, budget: 60_000_00,
    tags: ["social"], team: [],
    description: "Seasonal social campaign – cancelled by the client after a menu change.",
    steps: [["Campaign concept", "completed", -30, 20_000_00]],
    tasks: [],
  },
];

type PaymentSeed = [amount: number, daysAgo: number, method: "upi" | "bank_transfer" | "cash" | "card"];

interface InvoiceSeed {
  client: (typeof CLIENTS)[number]["key"];
  /** Index into PROJECTS, or null. */
  project: number | null;
  issuedDaysAgo: number;
  dueInDays: number;
  lines: [description: string, quantity: number, rate: number][];
  taxMode: "none" | "cgst_sgst" | "igst";
  status: "draft" | "sent" | "viewed";
  payments: PaymentSeed[];
}

/** Six months of billing so the dashboard and P&L have a believable history. */
const INVOICES: InvoiceSeed[] = [
  { client: "zenfit", project: 2, issuedDaysAgo: 165, dueInDays: 15, lines: [["Moodboards & discovery", 1, 20_000_00]], taxMode: "igst", status: "viewed", payments: [[23_600_00, 158, "upi"]] },
  { client: "kiran", project: 1, issuedDaysAgo: 140, dueInDays: 15, lines: [["Requirements workshop", 1, 50_000_00]], taxMode: "igst", status: "viewed", payments: [[59_000_00, 131, "bank_transfer"]] },
  { client: "zenfit", project: 2, issuedDaysAgo: 118, dueInDays: 15, lines: [["Logo concepts", 1, 50_000_00]], taxMode: "igst", status: "viewed", payments: [[59_000_00, 104, "upi"]] },
  { client: "pixel", project: 4, issuedDaysAgo: 96, dueInDays: 10, lines: [["Technical SEO audit", 1, 15_000_00]], taxMode: "none", status: "viewed", payments: [[15_000_00, 90, "upi"]] },
  { client: "kiran", project: 1, issuedDaysAgo: 82, dueInDays: 15, lines: [["Clickable prototype", 1, 1_00_000_00]], taxMode: "igst", status: "viewed", payments: [[1_18_000_00, 70, "bank_transfer"]] },
  { client: "zenfit", project: 2, issuedDaysAgo: 60, dueInDays: 15, lines: [["Brand guidelines", 1, 50_000_00]], taxMode: "igst", status: "viewed", payments: [[59_000_00, 48, "card"]] },
  { client: "bloom", project: 0, issuedDaysAgo: 44, dueInDays: 15, lines: [["Discovery & sitemap", 1, 30_000_00], ["Visual design", 1, 70_000_00]], taxMode: "cgst_sgst", status: "viewed", payments: [[1_18_000_00, 33, "upi"]] },
  { client: "kiran", project: 1, issuedDaysAgo: 30, dueInDays: 15, lines: [["Core app build – milestone 1", 1, 1_75_000_00]], taxMode: "igst", status: "viewed", payments: [[1_00_000_00, 12, "bank_transfer"]] },
  { client: "pixel", project: 4, issuedDaysAgo: 28, dueInDays: 10, lines: [["Keyword map", 1, 15_000_00]], taxMode: "none", status: "sent", payments: [] },
  { client: "bloom", project: 0, issuedDaysAgo: 6, dueInDays: 15, lines: [["Front-end build", 1, 90_000_00]], taxMode: "cgst_sgst", status: "sent", payments: [] },
  { client: "zenfit", project: 3, issuedDaysAgo: 0, dueInDays: 15, lines: [["Membership portal – advance (30%)", 1, 1_14_000_00]], taxMode: "igst", status: "draft", payments: [] },
];

/** [description, category, amount, daysAgo, project index or null, vendor] */
const EXPENSES: [string, string, number, number, number | null, string | null][] = [
  ...[150, 120, 90, 60, 30, 2].flatMap((daysAgo): [string, string, number, number, number | null, string | null][] => [
    ["Studio rent", "Rent", 35_000_00, daysAgo, null, "WeWork"],
    ["Design & dev tools", "Software", 8_400_00, daysAgo - 1, null, "Figma, GitHub, Notion"],
  ]),
  ["Stock photography", "Software", 4_200_00, 100, 2, "Shutterstock"],
  ["Freelance illustrator", "Freelancers", 18_000_00, 75, 2, "Ananya K."],
  ["Android test devices", "Office", 22_500_00, 68, 1, "Croma"],
  ["Play Console fee", "Taxes & fees", 2_100_00, 40, 1, "Google"],
  ["Menu photo shoot", "Freelancers", 12_000_00, 25, 0, "Lens & Light"],
  ["Client workshop travel", "Travel", 6_800_00, 21, 1, "IndiGo"],
  ["LinkedIn ads", "Marketing", 9_000_00, 14, null, "LinkedIn"],
  ["Hosting (staging)", "Software", 1_900_00, 5, 0, "Cloudflare"],
];

const TEAMMATES = [
  { googleSub: "dev:aarav", email: "aarav@agencyos.local", name: "Aarav Mehta", role: "admin", designation: "Operations Lead", monthlyCost: 85_000_00, hourlyRate: 1_200_00 },
  { googleSub: "dev:diya", email: "diya@agencyos.local", name: "Diya Kapoor", role: "member", designation: "Product Designer", monthlyCost: 70_000_00, hourlyRate: 1_000_00 },
  { googleSub: "dev:kabir", email: "kabir@agencyos.local", name: "Kabir Rao", role: "member", designation: "Full-stack Developer", monthlyCost: 90_000_00, hourlyRate: 1_400_00 },
] as const;

async function main() {
  // The same database `npm run dev` uses. Demo data never belongs in production, so anything that
  // is not on localhost is refused unless explicitly allowed.
  const url = localDatabaseUrl();
  if (!isLocalDatabase(url) && !process.argv.includes("--allow-remote")) {
    throw new Error("DATABASE_URL does not point at localhost. Re-run with `-- --allow-remote` if you really mean to seed it.");
  }
  const db = createDb(url);

  try {
    // 1. Demo owner (upsert by Google subject).
    const [owner] = await db
      .insert(users)
      .values(DEMO_OWNER)
      .onConflictDoUpdate({ target: users.googleSub, set: { name: DEMO_OWNER.name, email: DEMO_OWNER.email } })
      .returning();
    if (!owner) throw new Error("Could not create the demo owner");

    // 2. Start clean: remove every workspace the demo owner owns (cascades to all tenant data).
    const owned = await db
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, owner.id));
    const staleIds = [...new Set([...owned.map((row) => row.id), DEMO_WORKSPACE_ID])];
    await db.delete(workspaces).where(inArray(workspaces.id, staleIds));

    // 3. Workspace + owner membership + default expense categories.
    await createWorkspaceForUser(db, owner, { id: DEMO_WORKSPACE_ID, name: "Northwind Studio", currency: "INR" });
    await db
      .update(workspaces)
      .set({
        gstNumber: "29ABCDE1234F1Z5",
        address: "42 MG Road, Indiranagar\nBengaluru, Karnataka – 560038",
        phone: "+91 98765 43210",
        email: "hello@northwind.studio",
        website: "https://northwind.studio",
        invoicePrefix: "NWS",
        defaultTaxMode: "cgst_sgst",
        defaultTaxRate: 1800,
        upiId: "northwind@upi",
        bankDetails: "Northwind Studio LLP\nHDFC Bank · A/C 50200012345678\nIFSC HDFC0001234",
        invoiceTerms: "Payment due within 15 days. Late payments attract 1.5% interest per month.",
        onboardedAt: new Date(),
      })
      .where(eq(workspaces.id, DEMO_WORKSPACE_ID));

    // 4. Teammates.
    for (const mate of TEAMMATES) {
      const [user] = await db
        .insert(users)
        .values({ googleSub: mate.googleSub, email: mate.email, name: mate.name })
        .onConflictDoUpdate({ target: users.googleSub, set: { name: mate.name, email: mate.email } })
        .returning();
      if (!user) throw new Error(`Could not create ${mate.name}`);
      await db.insert(workspaceMembers).values({
        workspaceId: DEMO_WORKSPACE_ID,
        userId: user.id,
        role: mate.role,
        designation: mate.designation,
        monthlyCost: mate.monthlyCost,
        hourlyRate: mate.hourlyRate,
      });
    }

    // 5. Clients, projects, steps and tasks.
    const memberRows = await db
      .select({ id: workspaceMembers.id, name: users.name })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, DEMO_WORKSPACE_ID));
    const memberId = (name: string | undefined) => memberRows.find((row) => row.name === name)?.id ?? null;
    const ownerMemberId = memberId(DEMO_OWNER.name);

    const clientIds = new Map<string, string>();
    for (const { key, ...client } of CLIENTS) {
      const [row] = await db.insert(clients).values({ workspaceId: DEMO_WORKSPACE_ID, ...client }).returning({ id: clients.id });
      if (row) clientIds.set(key, row.id);
    }

    const columnCounts = new Map<string, number>();
    for (const seed of PROJECTS) {
      const position = columnCounts.get(seed.status) ?? 0;
      columnCounts.set(seed.status, position + 1);

      const [project] = await db
        .insert(projects)
        .values({
          workspaceId: DEMO_WORKSPACE_ID,
          clientId: seed.client ? (clientIds.get(seed.client) ?? null) : null,
          title: seed.title,
          description: seed.description,
          startDate: seed.start === null ? null : day(seed.start),
          dueDate: seed.due === null ? null : day(seed.due),
          budget: seed.budget,
          status: seed.status,
          priority: seed.priority,
          tags: seed.tags,
          position,
          createdBy: ownerMemberId,
        })
        .returning({ id: projects.id });
      if (!project) throw new Error(`Could not create project ${seed.title}`);

      const team = seed.team.map(memberId).filter((id): id is string => id !== null);
      if (team.length > 0) {
        await db.insert(projectMembers).values(team.map((id) => ({ workspaceId: DEMO_WORKSPACE_ID, projectId: project.id, memberId: id })));
      }
      if (seed.steps.length > 0) {
        await db.insert(projectSteps).values(
          seed.steps.map(([title, status, due, amount, assignee], index) => ({
            workspaceId: DEMO_WORKSPACE_ID,
            projectId: project.id,
            title,
            status,
            dueDate: day(due),
            amount,
            assigneeId: memberId(assignee),
            position: index,
            completedAt: status === "completed" ? new Date(Date.now() + due * 86_400_000) : null,
          })),
        );
      }
      if (seed.tasks.length > 0) {
        await db.insert(tasks).values(
          seed.tasks.map(([title, done, due, assignee], index) => ({
            workspaceId: DEMO_WORKSPACE_ID,
            projectId: project.id,
            title,
            done,
            doneAt: done ? new Date() : null,
            dueDate: due === null ? null : day(due),
            assigneeId: memberId(assignee),
            position: index,
            createdBy: ownerMemberId,
          })),
        );
      }
    }

    // 6. Invoices with payments, and expenses.
    const projectIds = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(eq(projects.workspaceId, DEMO_WORKSPACE_ID));
    const projectIdAt = (index: number | null) => (index === null ? null : (projectIds.find((row) => row.title === PROJECTS[index]?.title)?.id ?? null));

    for (const [index, seed] of INVOICES.entries()) {
      const items = seed.lines.map(([description, quantity, rate]) => ({ description, quantity, rate }));
      const totals = computeInvoiceTotals({ items, discountType: "none", discountValue: 0, taxMode: seed.taxMode, taxRate: 1800 });
      const amountPaid = seed.payments.reduce((total, [amount]) => total + amount, 0);
      const issuedAt = new Date(Date.now() - seed.issuedDaysAgo * 86_400_000);
      const status = amountPaid >= totals.total ? "paid" : amountPaid > 0 ? "partially_paid" : seed.status;

      const [invoice] = await db
        .insert(invoices)
        .values({
          workspaceId: DEMO_WORKSPACE_ID,
          clientId: clientIds.get(seed.client) ?? null,
          projectId: projectIdAt(seed.project),
          number: formatInvoiceNumber("NWS", index + 1),
          sequence: index + 1,
          status,
          issueDate: day(-seed.issuedDaysAgo),
          dueDate: day(-seed.issuedDaysAgo + seed.dueInDays),
          currency: "INR",
          taxMode: seed.taxMode,
          taxRate: seed.taxMode === "none" ? 0 : 1800,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          amountPaid,
          terms: "Payment due within 15 days.",
          bankDetails: "Northwind Studio LLP\nHDFC Bank · A/C 50200012345678\nIFSC HDFC0001234",
          upiId: "northwind@upi",
          publicToken: newPublicToken(),
          sentAt: seed.status === "draft" ? null : issuedAt,
          viewedAt: seed.status === "viewed" ? new Date(issuedAt.getTime() + 3_600_000) : null,
          paidAt: status === "paid" ? new Date(Date.now() - (seed.payments.at(-1)?.[1] ?? 0) * 86_400_000) : null,
          createdBy: ownerMemberId,
          createdAt: issuedAt,
        })
        .returning({ id: invoices.id });
      if (!invoice) throw new Error("Could not create invoice");

      await db.insert(invoiceItems).values(
        items.map((item, position) => ({ workspaceId: DEMO_WORKSPACE_ID, invoiceId: invoice.id, ...item, amount: totals.lineAmounts[position] ?? 0, position })),
      );
      if (seed.payments.length > 0) {
        await db.insert(payments).values(
          seed.payments.map(([amount, daysAgo, method]) => ({ workspaceId: DEMO_WORKSPACE_ID, invoiceId: invoice.id, amount, date: day(-daysAgo), method, createdBy: ownerMemberId })),
        );
      }
    }
    await db.update(workspaces).set({ invoiceNextNumber: INVOICES.length + 1 }).where(eq(workspaces.id, DEMO_WORKSPACE_ID));

    const categoryRows = await db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.workspaceId, DEMO_WORKSPACE_ID));
    await db.insert(expenses).values(
      EXPENSES.map(([description, category, amount, daysAgo, project, vendor]) => ({
        workspaceId: DEMO_WORKSPACE_ID,
        description,
        categoryId: categoryRows.find((row) => row.name === category)?.id ?? null,
        amount,
        date: day(-Math.max(0, daysAgo)),
        projectId: projectIdAt(project),
        vendor,
        createdBy: ownerMemberId,
      })),
    );

    // Contracts: the starter template, one draft and one that is out for signature (open its link to try signing).
    const [template] = await db.insert(contractTemplates).values({ workspaceId: DEMO_WORKSPACE_ID, name: STARTER_TEMPLATE_NAME, content: STARTER_TEMPLATE_HTML }).returning({ id: contractTemplates.id });
    const longDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "");
    const contractProjects = await db.select().from(projects).where(eq(projects.workspaceId, DEMO_WORKSPACE_ID)).limit(20);
    const withClient = contractProjects.filter((project) => project.clientId !== null && project.budget > 0).slice(0, 2);
    for (const [index, project] of withClient.entries()) {
      const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId as string)).limit(1);
      const sent = index === 1;
      await db.insert(contracts).values({
        workspaceId: DEMO_WORKSPACE_ID,
        clientId: project.clientId,
        projectId: project.id,
        templateId: template?.id ?? null,
        title: `${project.title} – service agreement`,
        content: fillContractVariables(STARTER_TEMPLATE_HTML, {
          client_name: client?.name ?? "",
          client_company: client?.company ?? "",
          project_title: project.title,
          amount: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(project.budget / 100),
          start_date: longDay(project.startDate),
          due_date: longDay(project.dueDate),
          agency_name: "Northwind Studio",
          today: longDay(day(0)),
        }),
        status: sent ? "sent" : "draft",
        sentAt: sent ? new Date() : null,
        publicToken: newPublicToken(),
        createdBy: ownerMemberId,
      });
    }

    // Client portal: one project already has its link switched on, with a message waiting.
    const portalProject = withClient[1] ?? withClient[0];
    const portalToken = newPublicToken();
    if (portalProject) {
      await db.insert(shareLinks).values({ workspaceId: DEMO_WORKSPACE_ID, projectId: portalProject.id, token: portalToken });
      await db.insert(comments).values({ workspaceId: DEMO_WORKSPACE_ID, projectId: portalProject.id, authorType: "client", authorName: "Arjun", body: "Thanks for the update! When can we review the next milestone?" });
    }

    // CRM: a small pipeline with follow-ups, so the board has something in every column.
    const LEADS: [string, string | null, string, string | null, "new" | "contacted" | "qualified" | "proposal" | "won" | "lost", number | null, number | null, string, string | undefined][] = [
      ["Rohan Verma", "Verma Sweets", "+91 98111 22334", "rohan@vermasweets.example", "new", 6000000, 0, "Website form", undefined],
      ["Sneha Iyer", "Iyer Yoga Studio", "+91 98222 33445", null, "new", null, null, "Instagram", "Kabir Rao"],
      ["Amit Shah", "Shah Electronics", "+91 98333 44556", "amit@shahelectronics.example", "contacted", 12000000, -1, "Website form", "Aarav Mehta"],
      ["Farah Khan", "Khan Interiors", "+91 98444 55667", "farah@khaninteriors.example", "qualified", 25000000, 2, "Referral", "Aarav Mehta"],
      ["Vikram Rao", "Rao Logistics", "+91 98555 66778", "vikram@raologistics.example", "proposal", 45000000, 4, "LinkedIn", undefined],
      ["Meera Joshi", "Joshi Bakes", "+91 98666 77889", null, "won", 8000000, null, "Referral", undefined],
      ["Kunal Desai", null, "+91 98777 88990", null, "lost", 3000000, null, "Website form", undefined],
    ];
    for (const [name, company, phone, email, stage, value, followUpIn, sourceLabel, owner] of LEADS) {
      const [lead] = await db
        .insert(leads)
        .values({
          workspaceId: DEMO_WORKSPACE_ID,
          name,
          company,
          phone,
          email,
          stage,
          value,
          sourceLabel,
          followUpDate: followUpIn === null ? null : day(followUpIn),
          assigneeId: memberId(owner),
          closedAt: stage === "won" || stage === "lost" ? new Date() : null,
          createdBy: ownerMemberId,
        })
        .returning({ id: leads.id });
      if (!lead) continue;
      await db.insert(leadNotes).values([
        { workspaceId: DEMO_WORKSPACE_ID, leadId: lead.id, kind: "system", body: "Lead added", authorName: DEMO_OWNER.name, authorMemberId: ownerMemberId },
        ...(stage === "new" ? [] : [{ workspaceId: DEMO_WORKSPACE_ID, leadId: lead.id, kind: "call" as const, body: "Had a first call. They want a quote and a rough timeline.", authorName: DEMO_OWNER.name, authorMemberId: ownerMemberId }]),
      ]);
    }

    console.log(`✔ Seeded "Northwind Studio": ${TEAMMATES.length + 1} members, ${CLIENTS.length} clients, ${PROJECTS.length} projects, ${INVOICES.length} invoices, ${EXPENSES.length} expenses, ${withClient.length} contracts, ${LEADS.length} leads.`);
    console.log('  Run `npm run dev` and choose "Continue as demo user" on /login.');
    if (portalProject) console.log(`  Client portal for "${portalProject.title}": /p/${portalToken}`);
    console.log("  Sign in as a teammate (e.g. diya@agencyos.local) with POST /api/auth/dev-login to see the member view.");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
