/**
 * Seeds the LOCAL D1 database with a demo workspace so the app has something to show.
 *
 *   npm run db:migrate:local   # once
 *   npm run db:seed            # re-runnable: wipes and recreates the demo workspace
 *
 * Then start `npm run dev` and click "Continue as demo user" on /login.
 * Each build phase extends this file with data for the features it adds.
 */
import { eq, inArray } from "drizzle-orm";
import { getPlatformProxy } from "wrangler";
import { createDb } from "../worker/db";
import { users, workspaceMembers, workspaces } from "../worker/db/schema";
import { createWorkspaceForUser } from "../worker/services/workspaces";

const DEMO_WORKSPACE_ID = "demo_workspace";

/** Must match the identity used by POST /api/auth/dev-login (worker/routes/auth.ts). */
const DEMO_OWNER = { googleSub: "dev:demo", email: "demo@agencyos.local", name: "Demo Owner" };

const TEAMMATES = [
  { googleSub: "dev:aarav", email: "aarav@agencyos.local", name: "Aarav Mehta", role: "admin", designation: "Operations Lead", monthlyCost: 85_000_00, hourlyRate: 1_200_00 },
  { googleSub: "dev:diya", email: "diya@agencyos.local", name: "Diya Kapoor", role: "member", designation: "Product Designer", monthlyCost: 70_000_00, hourlyRate: 1_000_00 },
  { googleSub: "dev:kabir", email: "kabir@agencyos.local", name: "Kabir Rao", role: "member", designation: "Full-stack Developer", monthlyCost: 90_000_00, hourlyRate: 1_400_00 },
] as const;

async function main() {
  // Connects to the same local D1 file that `npm run dev` and `wrangler d1 ... --local` use.
  const { env, dispose } = await getPlatformProxy<Pick<Env, "DB">>();
  const db = createDb(env.DB);

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

    console.log(`✔ Seeded "Northwind Studio" with ${TEAMMATES.length + 1} members.`);
    console.log('  Run `npm run dev` and choose "Continue as demo user" on /login.');
  } finally {
    await dispose();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
