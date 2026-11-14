// Release 0.1 R3: onboarding, run as the owner in rolled-back transactions (helpers.ts).
// The dry run is the one test on `db` itself: it must leave nothing, and says so.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import {
  onboard,
  onboardingFaults,
  runOnboarding,
  type Onboarding,
} from "../../src/onboard";
import { companies, invoiceCounters, users } from "../../src/schema";
import { asApp, one, rolledBack } from "../helpers";

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

// Unique per run: the name and the number are matched across the whole database, where
// other suites commit rows. 555-01XX is a fictional range.
const run = crypto.randomUUID().slice(0, 8);
const input: Onboarding = {
  companyName: `Onboard Co ${run}`,
  timezone: "America/New_York",
  nextInvoiceNumber: 1043,
  nextCreditMemoNumber: 8,
  adminName: "First Admin",
  adminPhone: `+1401555${String(parseInt(run.slice(0, 4), 16) % 10000).padStart(4, "0")}`,
};
const email = `owner-${run}@onboard.test`;

describe("onboard", () => {
  it("writes the company, both counters as stated and one unbound admin", async () => {
    await rolledBack(db, async (tx) => {
      const result = await onboard(tx, { ...input, adminEmail: email });
      expect(result).toEqual({
        currentUser: expect.any(String),
        database: expect.any(String),
        companyId: expect.any(String),
        adminId: expect.any(String),
      });
      expect(
        one(await tx.select().from(companies).where(eq(companies.id, result.companyId))),
      ).toMatchObject({ name: input.companyName, timezone: "America/New_York" });
      expect(
        one(
          await tx
            .select()
            .from(invoiceCounters)
            .where(eq(invoiceCounters.companyId, result.companyId)),
        ),
      ).toMatchObject({ nextInvoiceNumber: 1043, nextCreditMemoNumber: 8 });
      const roster = await tx
        .select()
        .from(users)
        .where(eq(users.companyId, result.companyId));
      expect(roster).toHaveLength(1);
      expect(roster[0]).toMatchObject({
        id: result.adminId,
        role: "admin",
        name: "First Admin",
        signInPhone: input.adminPhone,
        email,
        identitySubject: null,
        phone: null,
        deactivatedAt: null,
      });
    });
  });

  it("takes an admin with a number and no email", async () => {
    await rolledBack(db, async (tx) => {
      const result = await onboard(tx, input);
      const admin = one(
        await tx.select().from(users).where(eq(users.id, result.adminId)),
      );
      expect(admin.email).toBeNull();
    });
  });

  it("refuses trader_app before any write", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await expect(onboard(tx, input)).rejects.toThrow(
        "refusing to onboard as trader_app: the role has neither rolsuper nor rolbypassrls",
      );
    });
  });

  it("refuses a second company of the same name, whatever its case or spacing", async () => {
    await rolledBack(db, async (tx) => {
      await onboard(tx, input);
      await expect(
        onboard(tx, {
          ...input,
          companyName: `  ${input.companyName.toUpperCase()} `,
          adminPhone: "+14015550199",
        }),
      ).rejects.toThrow("refusing to onboard: a company of that name exists");
    });
  });

  it("refuses an admin whose number or email another roster holds", async () => {
    await rolledBack(db, async (tx) => {
      await onboard(tx, { ...input, adminEmail: email });
      const other = { ...input, companyName: `Other Co ${run}` };
      await expect(onboard(tx, other)).rejects.toThrow("already on a roster");
      await expect(
        onboard(tx, {
          ...other,
          adminPhone: "+14015550198",
          adminEmail: email.toUpperCase(),
        }),
      ).rejects.toThrow("already on a roster");
      const { rows } = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from companies where name = ${other.companyName}`,
      );
      expect(rows[0]!.n).toBe(0);
    });
  });

  it.each([
    ["timezone", { timezone: "Mars/Olympus" }],
    ["timezone", { timezone: "" }],
    ["adminPhone", { adminPhone: "4015550123" }],
    ["adminPhone", { adminPhone: "+440205550123" }],
    ["adminPhone", { adminPhone: "+1 401 555 0123" }],
    ["nextInvoiceNumber", { nextInvoiceNumber: 0 }],
    ["nextCreditMemoNumber", { nextCreditMemoNumber: 1.5 }],
    ["companyName", { companyName: "   " }],
    ["adminName", { adminName: "" }],
    ["adminEmail", { adminEmail: "not an address" }],
  ])("names %s as invalid and writes nothing", async (name, change) => {
    const bad = { ...input, ...change };
    expect(onboardingFaults(bad)).toEqual([name]);
    await rolledBack(db, async (tx) => {
      await expect(onboard(tx, bad)).rejects.toThrow(
        `refusing to onboard: invalid ${name}`,
      );
    });
  });

  it("names every missing field and no value", () => {
    expect(onboardingFaults({ adminPhone: "secret" }).sort()).toEqual([
      "adminName",
      "adminPhone",
      "companyName",
      "nextCreditMemoNumber",
      "nextInvoiceNumber",
      "timezone",
    ]);
  });
});

describe("runOnboarding", () => {
  it("performs every statement and leaves nothing unless told to apply", async () => {
    const result = await runOnboarding(db, input, { apply: false });
    expect(result.applied).toBe(false);
    const { rows } = await db.execute<{ n: number }>(sql`
      select (select count(*) from companies where id = ${result.companyId})::int
        + (select count(*) from users where sign_in_phone = ${input.adminPhone})::int as n
    `);
    expect(rows[0]!.n).toBe(0);
  });

  it("rolls a refusal back as a refusal, not as a dry run", async () => {
    await expect(
      runOnboarding(db, { ...input, timezone: "Mars/Olympus" }, { apply: false }),
    ).rejects.toThrow("refusing to onboard: invalid timezone");
  });
});
