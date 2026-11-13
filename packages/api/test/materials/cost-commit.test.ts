// Stage 4: material.setCost against real commits, in a database of its own (helpers.ts,
// disposableDb): a closeout that commits can never be deleted, two connections must see the
// same rows, and the lock-wait probe reads every backend of its database. Each test holds a
// row from the owner's transaction, lets the calls queue, and releases them by committing.
import { dayCloseoutMaterials, materials } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDirectory } from "../../src/core/identity";
import { createContext } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { createCallerFactory } from "../../src/core/trpc";
import { appRouter } from "../../src/router";
import {
  boundIn,
  crewDayIn,
  disposableDb,
  materialIn,
  outcome,
  quietReporter,
  REQUEST_ID,
  uuidv7,
  waitForLockWait,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app({ max: 6 });
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const as = (who: VerifiedIdentity) =>
  createCallerFactory(appRouter)(
    createContext({
      directory: localDirectory,
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  );

const DAY = "2026-10-05";
const usd = (cents: number) => ({ cents, currency: "USD" });

// A committed crew day with two bound admins and one receipt on J that day.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const admin = await boundIn(tx, d.companyId, "admin");
    const second = await boundIn(tx, d.companyId, "admin");
    const m = await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
    return { ...d, admin, second, m };
  });
}

const costOf = async (id: string) =>
  (
    await D.owner
      .select({ costCents: materials.costCents, currency: materials.currency })
      .from(materials)
      .where(eq(materials.id, id))
  )[0]!;

describe("material.setCost — real commits", () => {
  it("waits out a closeout in flight, then prices the member it sealed", async () => {
    const d = await world();
    const { fingerprint } = await as(d.admin.who).closeout.review({
      jobId: d.J,
      workDate: DAY,
    });
    let submitted!: ReturnType<ReturnType<typeof as>["closeout"]["submit"]>;
    let priced!: ReturnType<ReturnType<typeof as>["material"]["setCost"]>;
    await D.owner.transaction(async (tx) => {
      // The closeout locks the day's receipts FOR SHARE once it holds the field-write lock
      // exclusive (submit.ts): held here, it stops there, the lock taken.
      await tx.execute(sql`select 1 from materials where id = ${d.m} for update`);
      submitted = as(d.admin.who).closeout.submit({
        id: uuidv7(),
        jobId: d.J,
        workDate: DAY,
        jobStatus: "open",
        note: null,
        clientTimestamp: new Date("2026-10-05T21:00:00.000Z"),
        reviewFingerprint: fingerprint,
      });
      await waitForLockWait(D.owner, '%from "materials"%for share%');
      priced = as(d.second.who).material.setCost({ materialId: d.m, cost: usd(8999) });
      await waitForLockWait(D.owner, "%pg_advisory_xact_lock_shared%", {
        waitEvent: "advisory",
      });
    });
    expect(await submitted).toMatchObject({ result: "accepted" });
    expect(await priced).toEqual({ result: "saved", cost: usd(8999) });
    expect(
      await D.owner
        .select({ materialId: dayCloseoutMaterials.materialId })
        .from(dayCloseoutMaterials)
        .where(eq(dayCloseoutMaterials.companyId, d.companyId)),
    ).toEqual([{ materialId: d.m }]);
    expect(await costOf(d.m)).toEqual({ costCents: 8999, currency: "USD" });
  });

  it("lets two admins price one receipt in turn: the later entry stands", async () => {
    const d = await world();
    let calls!: Promise<{ result: string }[]>;
    await D.owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from materials where id = ${d.m} for update`);
      calls = Promise.all([
        as(d.admin.who).material.setCost({ materialId: d.m, cost: usd(100) }),
        as(d.second.who).material.setCost({ materialId: d.m, cost: usd(200) }),
      ]);
      await waitForLockWait(D.owner, '%from "materials"%for no key update%', { n: 2 });
    });
    expect((await calls).map((a) => a.result)).toEqual(["saved", "saved"]);
    expect([100, 200]).toContain((await costOf(d.m)).costCents);
  });

  for (const change of ["deactivated_at = now()", "role = 'worker'"] as const) {
    const expected = change.startsWith("role") ? "FORBIDDEN" : "UNAUTHORIZED";
    it(`refuses an admin whose ${change} committed while they waited: ${expected}`, async () => {
      const d = await world();
      let answer!: Promise<string>;
      await D.owner.transaction(async (tx) => {
        await tx.execute(sql`select 1 from users where id = ${d.second.id} for update`);
        answer = outcome(
          as(d.second.who).material.setCost({ materialId: d.m, cost: usd(1) }),
        );
        await waitForLockWait(D.owner, '%from "users"%for share%');
        await tx.execute(
          sql`update users set ${sql.raw(change)} where id = ${d.second.id}`,
        );
      });
      expect(await answer).toBe(expected);
      expect(await costOf(d.m)).toEqual({ costCents: null, currency: null });
    });
  }
});
