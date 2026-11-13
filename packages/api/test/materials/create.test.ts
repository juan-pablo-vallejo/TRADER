// Stage 4: material.create (V1-D09) through the application's router, under the runtime role
// in rolled-back transactions (helpers.ts, "Rolled-back calls"). Closeouts and device
// receipts are written as the owner; nothing is committed but the fixtures of the lock test,
// which holds no append-only row. Real commits are create-commit.test.ts's.
import {
  approvals,
  companies,
  dayCloseoutMaterials,
  dayCloseouts,
  jobs,
  materials,
} from "@trader/db/schema";
import { asc, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import {
  appCallerIn,
  asTenant,
  auditRowsIn,
  boundIn,
  committedCrewDay,
  companyIn,
  crewDayIn,
  holding,
  lockTimeout,
  materialIn,
  outcome,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  type CrewDay,
} from "../helpers";
import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { lockCompanyFieldWrites } from "../../src/labor/timeline";
import { workDate } from "../../src/labor/work-date";
import { createMaterial } from "../../src/materials/create";

let owner: Db;
let other: Db;
beforeAll(() => {
  owner = ownerDb();
  other = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
});

const NY = "America/New_York";
const D = "2026-10-05";
// Noon on 5 October in New York, daylight time.
const NOON_D = new Date("2026-10-05T16:00:00.000Z");

const entry = (jobId: string, o: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  jobId,
  workDate: D,
  description: "Eggshell, white",
  quantity: "2.5",
  unit: "gal",
  cost: null,
  ...o,
});

const create = (tx: Tx, who: unknown, input: unknown) =>
  appCallerIn(tx, who).material.create(input as never);

const rowOf = async (tx: Tx, id: string) =>
  (await tx.select().from(materials).where(eq(materials.id, id)))[0];

const approvalOf = async (tx: Tx, materialId: string) =>
  (await tx.select().from(approvals).where(eq(approvals.materialId, materialId)))[0];

const count = async (tx: Tx, companyId: string) =>
  (await tx.select().from(materials).where(eq(materials.companyId, companyId))).length;

// A closeout of J on D covering `ids`, written as the owner.
async function cover(tx: Tx, d: CrewDay, ids: string[]) {
  const closeoutId = uuidv7();
  await tx.insert(dayCloseouts).values({
    id: closeoutId,
    companyId: d.companyId,
    jobId: d.J,
    workDate: D,
    timezone: NY,
    jobStatus: "open",
    jobStatusApplied: true,
    submittedByUserId: d.foremanId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 0,
    materialCount: ids.length,
  });
  if (ids.length > 0) {
    await tx.insert(dayCloseoutMaterials).values(
      ids.map((materialId) => ({
        companyId: d.companyId,
        closeoutId,
        jobId: d.J,
        materialId,
      })),
    );
  }
}

async function officeDay(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  return { d, admin };
}

describe("material.create — the entry", () => {
  it("stores a receipt entered by the office: its admin, its provenance, noon of its day", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await asTenant(tx, d.companyId);
      const input = entry(d.J, { cost: { cents: 8999, currency: "USD" } });

      expect(await create(tx, admin.who, input)).toEqual({
        result: "created",
        entry: { id: input.id, loggedAt: NOON_D, reasons: [] },
      });
      const row = await rowOf(tx, input.id);
      expect(row).toMatchObject({
        companyId: d.companyId,
        jobId: d.J,
        loggedByUserId: admin.id,
        enteredByOffice: true,
        description: "Eggshell, white",
        quantity: "2.500",
        unit: "gal",
        costCents: 8999,
        currency: "USD",
        loggedAt: NOON_D,
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
      });
      expect(row!.createdAt.getTime()).toBe(row!.updatedAt.getTime());
      // On an open day it counts like a clean device receipt: no approval, and no audit row.
      expect(await approvalOf(tx, input.id)).toBeUndefined();
      expect(await auditRowsIn(tx, d.companyId)).toEqual([]);
    });
  });

  it("stores no cost when none is sent", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await asTenant(tx, d.companyId);
      const input = entry(d.J);
      await create(tx, admin.who, input);
      expect(await rowOf(tx, input.id)).toMatchObject({
        costCents: null,
        currency: null,
      });
    });
  });

  it("places the day at noon on the company's wall clock, across a clock change", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await asTenant(tx, d.companyId);
      // 8 March 2026 skips 02:00 in New York and 1 November repeats 01:00: noon is neither.
      for (const [day, noon] of [
        ["2026-03-07", "2026-03-07T17:00:00.000Z"],
        ["2026-03-08", "2026-03-08T16:00:00.000Z"],
        ["2026-11-01", "2026-11-01T17:00:00.000Z"],
      ] as const) {
        const answer = await create(tx, admin.who, entry(d.J, { workDate: day }));
        expect(answer).toMatchObject({ result: "created", entry: { reasons: [] } });
        if (answer.result !== "created") throw new Error("unreachable");
        expect(answer.entry.loggedAt).toEqual(new Date(noon));
        expect(workDate(answer.entry.loggedAt, NY)).toBe(day);
      }
    });
  });

  it("reads the day in the company's zone, not the server's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await tx
        .update(companies)
        .set({ timezone: "Pacific/Auckland" })
        .where(eq(companies.id, d.companyId));
      await asTenant(tx, d.companyId);
      const answer = await create(tx, admin.who, entry(d.J));
      // Noon on 5 October in Auckland (UTC+13) is the 4th, 23:00 UTC.
      expect(answer).toMatchObject({
        result: "created",
        entry: { loggedAt: new Date("2026-10-04T23:00:00.000Z") },
      });
    });
  });

  it("accepts today and refuses a day that has not come, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await asTenant(tx, d.companyId);
      const today = workDate(new Date(), NY);
      const later = workDate(new Date(Date.now() + 2 * 86_400_000), NY);

      expect(await create(tx, admin.who, entry(d.J, { workDate: today }))).toMatchObject({
        result: "created",
      });
      const refused = entry(d.J, { workDate: later });
      expect(await create(tx, admin.who, refused)).toEqual({
        result: "rejected",
        code: "date_in_future",
      });
      expect(await rowOf(tx, refused.id)).toBeUndefined();
      expect(await count(tx, d.companyId)).toBe(1);
    });
  });

  it("enters a receipt on an archived job and on a job with no crew", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      await asTenant(tx, d.companyId);
      for (const job of [d.J, d.K]) {
        expect(await create(tx, admin.who, entry(job))).toMatchObject({
          result: "created",
        });
      }
    });
  });
});

describe("material.create — a closed-out day", () => {
  it("is pending after_closeout, refused to its author and decided by another admin", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      const second = await boundIn(tx, d.companyId, "admin");
      await cover(tx, d, []);
      await asTenant(tx, d.companyId);
      const input = entry(d.J);

      expect(await create(tx, admin.who, input)).toEqual({
        result: "created",
        entry: { id: input.id, loggedAt: NOON_D, reasons: ["after_closeout"] },
      });
      const approval = await approvalOf(tx, input.id);
      expect(approval).toMatchObject({
        reasons: ["after_closeout"],
        decision: null,
        decidedByUserId: null,
      });

      const decide = (who: unknown) =>
        appCallerIn(tx, who).approval.decide({
          approvalId: approval!.id,
          decision: "approved",
        });
      expect(await decide(admin.who)).toEqual({ result: "rejected", code: "own_entry" });
      expect((await approvalOf(tx, input.id))!.decision).toBeNull();
      expect(await decide(second.who)).toMatchObject({ result: "decided" });
      expect(await approvalOf(tx, input.id)).toMatchObject({
        decision: "approved",
        decidedByUserId: second.id,
      });
    });
  });

  it("judges the day in the closeout's own zone, and only that job's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await cover(tx, d, []);
      await asTenant(tx, d.companyId);
      const reasonsOf = async (o: Record<string, unknown>, job = d.J) => {
        const answer = await create(tx, admin.who, entry(job, o));
        if (answer.result !== "created") throw new Error("unreachable");
        return answer.entry.reasons;
      };
      expect(await reasonsOf({ workDate: "2026-10-04" })).toEqual([]);
      expect(await reasonsOf({ workDate: "2026-10-06" })).toEqual([]);
      expect(await reasonsOf({}, d.K)).toEqual([]);
      expect(await reasonsOf({})).toEqual(["after_closeout"]);
    });
  });

  it("changes no receipt, closeout, membership or approval that exists", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      const member = await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      const open = await materialIn(tx, d, d.K, "2026-10-05T15:00:00Z");
      await cover(tx, d, [member]);
      const late = await materialIn(tx, d, d.J, "2026-10-05T18:00:00Z");
      await tx.insert(approvals).values({
        companyId: d.companyId,
        materialId: late,
        reasons: ["after_closeout"],
      });
      await asTenant(tx, d.companyId);
      const input = entry(d.J, { cost: { cents: 100, currency: "USD" } });

      const standing = async () => ({
        receipts: await tx
          .select()
          .from(materials)
          .where(ne(materials.id, input.id))
          .orderBy(asc(materials.id)),
        closeouts: await tx.select().from(dayCloseouts),
        members: await tx.select().from(dayCloseoutMaterials),
        approvals: await tx
          .select()
          .from(approvals)
          .where(eq(approvals.materialId, late)),
      });
      const before = await standing();
      expect(before.receipts.map((r) => r.id).sort()).toEqual(
        [member, open, late].sort(),
      );

      expect(await create(tx, admin.who, input)).toMatchObject({
        result: "created",
        entry: { reasons: ["after_closeout"] },
      });
      expect(await standing()).toEqual(before);
      // The sealed membership still names the one receipt the closeout covered.
      expect(before.members.map((m) => m.materialId)).toEqual([member]);
    });
  });
});

describe("material.create — retries and ids", () => {
  it("answers the same entry again as duplicate, also after it was repriced", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await cover(tx, d, []);
      await asTenant(tx, d.companyId);
      const input = entry(d.J);
      const first = await create(tx, admin.who, input);
      if (first.result !== "created") throw new Error("unreachable");

      expect(await create(tx, admin.who, input)).toEqual({
        result: "duplicate",
        entry: first.entry,
      });
      await appCallerIn(tx, admin.who).material.setCost({
        materialId: input.id,
        cost: { cents: 4200, currency: "USD" },
      });
      expect(await create(tx, admin.who, input)).toMatchObject({ result: "duplicate" });
      expect(await rowOf(tx, input.id)).toMatchObject({ costCents: 4200 });
      expect(await count(tx, d.companyId)).toBe(1);
      expect(
        await tx.select().from(approvals).where(eq(approvals.companyId, d.companyId)),
      ).toHaveLength(1);
    });
  });

  it("answers an id that holds anything else as id_conflict and leaves the row", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      const second = await boundIn(tx, d.companyId, "admin");
      // A device receipt the same admin pushed, with the facts the entry would have.
      const pushed = uuidv7();
      await tx.insert(materials).values({
        id: pushed,
        companyId: d.companyId,
        jobId: d.J,
        loggedByUserId: admin.id,
        description: "Eggshell, white",
        quantity: "2.500",
        unit: "gal",
        loggedAt: NOON_D,
        capturedOffline: false,
        clockSkewed: false,
        clockSkewMs: 0,
        enteredByOffice: false,
      });
      const theirs = await companyIn(tx);
      const job = (
        await tx
          .insert(jobs)
          .values({
            companyId: theirs.companyId,
            customerId: theirs.customerId,
            name: "X",
          })
          .returning({ id: jobs.id })
      )[0]!.id;
      const foreign = await materialIn(
        tx,
        { ...d, companyId: theirs.companyId },
        job,
        "2026-10-05T15:00:00Z",
        theirs.userId,
      );
      await asTenant(tx, d.companyId);
      const conflict = { result: "rejected", code: "id_conflict" };

      const input = entry(d.J);
      await create(tx, admin.who, input);
      for (const changed of [
        { description: "Other" },
        { quantity: "3" },
        { unit: "qt" },
        { workDate: "2026-10-04" },
        { jobId: d.K },
      ]) {
        expect(await create(tx, admin.who, { ...input, ...changed })).toEqual(conflict);
      }
      // Another admin's entry, a device's receipt, another tenant's row.
      expect(await create(tx, second.who, input)).toEqual(conflict);
      expect(await create(tx, admin.who, entry(d.J, { id: pushed }))).toEqual(conflict);
      expect(await create(tx, admin.who, entry(d.J, { id: foreign }))).toEqual(conflict);

      expect(await rowOf(tx, input.id)).toMatchObject({
        description: "Eggshell, white",
        loggedByUserId: admin.id,
      });
      expect((await rowOf(tx, pushed))!.enteredByOffice).toBe(false);
      expect(await count(tx, d.companyId)).toBe(2);
    });
  });
});

describe("material.create — who and what", () => {
  it("admits an active admin only, for a job of their own company", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      const theirs = await companyIn(tx);
      const job = (
        await tx
          .insert(jobs)
          .values({
            companyId: theirs.companyId,
            customerId: theirs.customerId,
            name: "X",
          })
          .returning({ id: jobs.id })
      )[0]!.id;
      await asTenant(tx, d.companyId);

      expect(await outcome(create(tx, worker.who, entry(d.J)))).toBe("FORBIDDEN");
      expect(await outcome(create(tx, d.who, entry(d.J)))).toBe("FORBIDDEN");
      expect(await outcome(create(tx, gone.who, entry(d.J)))).toBe("UNAUTHORIZED");
      expect(await outcome(create(tx, admin.who, entry(job)))).toBe("FORBIDDEN");
      expect(await outcome(create(tx, admin.who, entry(uuidv7())))).toBe("FORBIDDEN");
      await asTenant(tx, d.companyId);
      expect(await count(tx, d.companyId)).toBe(0);
    });
  });

  it("refuses malformed input as BAD_REQUEST", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin } = await officeDay(tx);
      await asTenant(tx, d.companyId);
      for (const bad of [
        { id: crypto.randomUUID() },
        { workDate: "2026-02-30" },
        { workDate: "10/05/2026" },
        { workDate: "2026-10-05T12:00:00Z" },
        { description: "  " },
        { quantity: "0" },
        { quantity: "1.2345" },
        { unit: "" },
        { cost: { cents: 1.5, currency: "USD" } },
        { cost: { cents: 100, currency: "usd" } },
        { cost: { cents: 100 } },
        { enteredByOffice: false },
        { loggedByUserId: d.w1 },
        { loggedAt: new Date() },
      ]) {
        expect(
          await outcome(create(tx, admin.who, entry(d.J, bad))),
          JSON.stringify(bad),
        ).toBe("BAD_REQUEST");
      }
      await asTenant(tx, d.companyId);
      expect(await count(tx, d.companyId)).toBe(0);
    });
  });
});

describe("material.create — the field-write lock", () => {
  it("waits behind a closeout's exclusive lock", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const admin = await owner.transaction((tx) => boundIn(tx, d.companyId, "admin"));
    const user: AppUser = {
      id: admin.id,
      companyId: d.companyId,
      role: "admin",
      name: "n",
      email: "e@co.test",
      phone: null,
      signInPhone: null,
    };
    try {
      await holding(
        owner,
        async (closeout) => {
          await closeout.execute(
            sql`select set_config('app.company_id', ${d.companyId}, true)`,
          );
          await lockCompanyFieldWrites(closeout, "exclusive");
        },
        async () => {
          await rolledBack(other, async (tx) => {
            await asTenant(tx, d.companyId);
            await lockTimeout(tx);
            const error = await rejection(
              tx.transaction((sp) =>
                createMaterial(sp, user, { ...entry(d.J), quantity: "2.500" }),
              ),
            );
            expect(sqlstateOf(error)).toBe("55P03");
          });
        },
      );
    } finally {
      await cleanup();
    }
  });
});
