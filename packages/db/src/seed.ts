import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { getDb } from "./client";
import { companies, users } from "./schema/index";

config({ path: "../../.env" });

/**
 * Seeds the single v1 company (SPEC §4) and, if configured, promotes one Clerk
 * user to admin.
 *
 * Everyone else becomes a `worker` automatically on their first authenticated
 * request (JIT provisioning in packages/api). Phase 0's done-criteria needs one
 * admin to exist, and no self-service path should ever mint one — hence an
 * explicit, deliberate promotion here rather than a default.
 *
 * Idempotent: safe to re-run.
 */
async function main() {
  const db = getDb();

  const existing = await db.select().from(companies).limit(1);
  const company =
    existing[0] ??
    (
      await db
        .insert(companies)
        .values({
          name: process.env.SEED_COMPANY_NAME ?? "TRADER Pilot Co",
          timezone: process.env.SEED_COMPANY_TIMEZONE ?? "America/New_York",
        })
        .returning()
    )[0];

  if (!company) throw new Error("Failed to create or find the seed company.");
  console.log(`Company: ${company.name} (${company.id}) tz=${company.timezone}`);

  const adminClerkId = process.env.SEED_ADMIN_CLERK_USER_ID;
  if (!adminClerkId) {
    console.log(
      "SEED_ADMIN_CLERK_USER_ID not set — skipping admin promotion.\n" +
        "  Sign in once, then set it in .env and re-run `pnpm db:seed`.",
    );
    return;
  }

  const [admin] = await db
    .insert(users)
    .values({
      companyId: company.id,
      clerkUserId: adminClerkId,
      role: "admin",
      name: process.env.SEED_ADMIN_NAME ?? "Admin",
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { role: "admin", updatedAt: new Date() },
    })
    .returning();

  console.log(`Admin: ${admin?.name} (${adminClerkId}) -> role=admin`);

  const count = await db.select().from(users).where(eq(users.companyId, company.id));
  console.log(`Users in company: ${count.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
