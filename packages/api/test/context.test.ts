import { users } from "@trader/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createContext, PROVISIONAL_USER_NAME } from "../src/context.js";
import {
  API_TEST_COMPANY,
  clearTestUsers,
  countUsers,
  findUser,
  pool,
  seedCompany,
  testDb,
  oldestCompanyId,
  withEmptyTenantTables,
} from "./helpers.js";

beforeAll(seedCompany);
beforeEach(clearTestUsers);
afterAll(async () => {
  await clearTestUsers();
  await pool.end();
});

describe("unauthenticated requests", () => {
  it("produce a context with no user", async () => {
    const ctx = await createContext({ auth: null, db: testDb });
    expect(ctx.user).toBeNull();
  });
});

describe("just-in-time provisioning", () => {
  it("creates the row on first sign-in, defaulting to worker", async () => {
    const ctx = await createContext({
      auth: { clerkUserId: "api_test_new" },
      db: testDb,
    });

    expect(ctx.user?.role).toBe("worker");
    expect(ctx.user?.active).toBe(true);
    // Attached to the oldest company, which is the rule the resolver documents.
    // Asserted against a lookup rather than a hardcoded id, so this stays true
    // whichever fixtures other suites happen to have left behind.
    expect(ctx.user?.companyId).toBe(await oldestCompanyId());
  });

  it("is idempotent: no duplicate, and the same row comes back", async () => {
    const first = await createContext({
      auth: { clerkUserId: "api_test_twice" },
      db: testDb,
    });
    const second = await createContext({
      auth: { clerkUserId: "api_test_twice" },
      db: testDb,
    });
    const third = await createContext({
      auth: { clerkUserId: "api_test_twice" },
      db: testDb,
    });

    expect(await countUsers("api_test_twice")).toBe(1);
    // Identity, not just the count — this is what proves the second call read
    // the existing row rather than silently replacing it.
    expect(second.user?.id).toBe(first.user?.id);
    expect(third.user?.id).toBe(first.user?.id);
  });

  it("uses a supplied profile on insert", async () => {
    const ctx = await createContext({
      auth: {
        clerkUserId: "api_test_profile",
        profile: { name: "Marisol Reyes", phone: "+15550100" },
      },
      db: testDb,
    });

    expect(ctx.user?.name).toBe("Marisol Reyes");
    expect(ctx.user?.phone).toBe("+15550100");
  });

  it("ignores the profile once the row exists", async () => {
    await createContext({
      auth: { clerkUserId: "api_test_stable", profile: { name: "Original Name" } },
      db: testDb,
    });

    // An admin corrects the name in Phase 2 roster management...
    await testDb
      .update(users)
      .set({ name: "Corrected By Admin" })
      .where(eq(users.clerkUserId, "api_test_stable"));

    // ...and the next sign-in must not undo it.
    const ctx = await createContext({
      auth: { clerkUserId: "api_test_stable", profile: { name: "Stale Clerk Name" } },
      db: testDb,
    });

    expect(ctx.user?.name).toBe("Corrected By Admin");
  });

  it("falls back to the provisional name when no profile is given", async () => {
    const ctx = await createContext({
      auth: { clerkUserId: "api_test_noname" },
      db: testDb,
    });
    expect(ctx.user?.name).toBe(PROVISIONAL_USER_NAME);
  });

  it("fails with an actionable message when no company is seeded", async () => {
    await withEmptyTenantTables(async (db) => {
      await expect(
        createContext({ auth: { clerkUserId: "api_test_nocompany" }, db }),
      ).rejects.toThrow(/pnpm db:seed/);
    });
  });
});

describe("an existing privileged row survives sign-in", () => {
  // The regression guard against the shape this file nearly shipped: an upsert
  // writing `role`, copied from seed.ts where it is legitimate. That would demote
  // an admin the moment they signed in and silently undo a deactivation, while
  // the happy path looked entirely healthy.
  //
  // What this actually catches, verified by breaking it: replacing select-first
  // with an upsert that writes role or name. It does *not* catch a role-writing
  // `set` clause while select-first remains — that path is unreachable for an
  // existing row, which is precisely why select-first was chosen over an inert
  // clause. Four tests fail on the realistic regression; this is one of them.
  it("preserves role, name and active even when handed a conflicting profile", async () => {
    // Through Drizzle: `id` comes from `$defaultFn` in the schema, not a
    // database default, so a raw INSERT would violate NOT NULL.
    await testDb.insert(users).values({
      companyId: API_TEST_COMPANY,
      clerkUserId: "api_test_admin",
      role: "admin",
      name: "Real Admin",
      active: false,
    });

    const ctx = await createContext({
      auth: {
        clerkUserId: "api_test_admin",
        profile: { name: "Should Be Ignored", phone: "+15550999" },
      },
      db: testDb,
    });

    expect(ctx.user?.role, "role must not be rewritten on sign-in").toBe("admin");
    expect(ctx.user?.name, "name must not be rewritten on sign-in").toBe("Real Admin");
    expect(ctx.user?.active, "active must not be rewritten on sign-in").toBe(false);

    const persisted = await findUser("api_test_admin");
    expect(persisted?.role).toBe("admin");
    expect(persisted?.active).toBe(false);
  });
});
