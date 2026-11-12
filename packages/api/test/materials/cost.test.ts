// Stage 4: material.setCost through the application's router, under the runtime role in
// rolled-back transactions (helpers.ts, "Rolled-back calls"). Closeouts, corrections and
// approvals are written as the owner; nothing is committed. Real commits are
// cost-commit.test.ts's.
import {
  approvals,
  dayCloseoutMaterials,
  dayCloseouts,
  materialCorrections,
  materials,
} from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import {
  appCallerIn,
  asTenant,
  auditRowsIn,
  boundIn,
  correctionIn,
  crewDayIn,
  lateReceiptIn,
  materialIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  type CrewDay,
} from "../helpers";
import type { Tx } from "../../src/core/context";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

const D = "2026-10-05";
const ON_D = "2026-10-05T15:00:00Z";
const usd = (cents: number) => ({ cents, currency: "USD" });

const setCost = (tx: Tx, who: unknown, materialId: string, cost: unknown) =>
  appCallerIn(tx, who).material.setCost({ materialId, cost } as never);

const rowOf = async (tx: Tx, id: string) =>
  (await tx.select().from(materials).where(eq(materials.id, id)))[0]!;

// Every column the office's cost entry may not touch.
const factsOf = (row: Awaited<ReturnType<typeof rowOf>>) => {
  const { costCents: _c, currency: _u, updatedAt: _t, ...facts } = row;
  return facts;
};

// A closeout of J on D covering `ids`, written as the owner: the sealed rows are what the
// freeze (0018) reads.
async function cover(tx: Tx, d: CrewDay, ids: string[]) {
  const closeoutId = uuidv7();
  await tx.insert(dayCloseouts).values({
    id: closeoutId,
    companyId: d.companyId,
    jobId: d.J,
    workDate: D,
    timezone: "America/New_York",
    jobStatus: "open",
    jobStatusApplied: true,
    submittedByUserId: d.foremanId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 0,
    materialCount: ids.length,
  });
  await tx.insert(dayCloseoutMaterials).values(
    ids.map((materialId) => ({
      companyId: d.companyId,
      closeoutId,
      jobId: d.J,
      materialId,
    })),
  );
}

const decideAs = (tx: Tx, approvalId: string, by: string, decision: string) =>
  tx
    .update(approvals)
    .set({
      decision: decision as "approved" | "rejected",
      decidedAt: new Date(),
      decidedByUserId: by,
    })
    .where(eq(approvals.id, approvalId));

describe("material.setCost", () => {
  it("prices an open receipt, changing only its cost, currency and updated_at", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const m = await materialIn(tx, d, d.J, ON_D);
      await asTenant(tx, d.companyId);
      const before = await rowOf(tx, m);
      expect([before.costCents, before.currency]).toEqual([null, null]);

      expect(await setCost(tx, admin.who, m, usd(8999))).toEqual({
        result: "saved",
        cost: usd(8999),
      });
      const after = await rowOf(tx, m);
      expect([after.costCents, after.currency]).toEqual([8999, "USD"]);
      expect(factsOf(after)).toEqual(factsOf(before));
      expect(after.updatedAt.getTime()).not.toBe(before.updatedAt.getTime());
    });
  });

  it("prices a closed-out member and an after-closeout receipt, frozen but for their cost", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const member = await materialIn(tx, d, d.J, ON_D);
      await cover(tx, d, [member]);
      const late = (await lateReceiptIn(tx, d)).materialId;
      await asTenant(tx, d.companyId);

      for (const id of [member, late]) {
        const before = await rowOf(tx, id);
        expect(await setCost(tx, admin.who, id, usd(4599))).toEqual({
          result: "saved",
          cost: usd(4599),
        });
        expect(await setCost(tx, admin.who, id, usd(4600))).toMatchObject({
          result: "saved",
        });
        expect(await setCost(tx, admin.who, id, null)).toEqual({
          result: "saved",
          cost: null,
        });
        expect(await setCost(tx, admin.who, id, usd(12))).toMatchObject({
          result: "saved",
        });
        const after = await rowOf(tx, id);
        expect([after.costCents, after.currency]).toEqual([12, "USD"]);
        expect(factsOf(after)).toEqual(factsOf(before));
      }
      // The freeze itself still stands for the runtime role: any other column is refused.
      await expect(
        tx.transaction((sp) =>
          sp.update(materials).set({ unit: "qt" }).where(eq(materials.id, member)),
        ),
      ).rejects.toThrow();
    });
  });

  it("answers unchanged for the cost a receipt already has, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const m = await materialIn(tx, d, d.J, ON_D);
      await asTenant(tx, d.companyId);
      const unpriced = await rowOf(tx, m);

      // Not priced, asked to be not priced.
      expect(await setCost(tx, admin.who, m, null)).toEqual({
        result: "unchanged",
        cost: null,
      });
      expect(await rowOf(tx, m)).toEqual(unpriced);

      await setCost(tx, admin.who, m, usd(0));
      const priced = await rowOf(tx, m);
      // Zero is a cost: a resend of it is the same cost, and NULL is a change.
      expect(await setCost(tx, admin.who, m, usd(0))).toEqual({
        result: "unchanged",
        cost: usd(0),
      });
      expect(await rowOf(tx, m)).toEqual(priced);
      // The same amount in another currency is another cost.
      expect(await setCost(tx, admin.who, m, { cents: 0, currency: "CAD" })).toEqual({
        result: "saved",
        cost: { cents: 0, currency: "CAD" },
      });
    });
  });

  it("replaces a cost and clears it, both columns together", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const second = await boundIn(tx, d.companyId, "admin");
      const m = await materialIn(tx, d, d.J, ON_D);
      await asTenant(tx, d.companyId);

      await setCost(tx, admin.who, m, usd(100));
      // Another admin's entry stands over the first.
      expect(await setCost(tx, second.who, m, usd(2147483647))).toEqual({
        result: "saved",
        cost: usd(2147483647),
      });
      expect(await setCost(tx, admin.who, m, null)).toEqual({
        result: "saved",
        cost: null,
      });
      const cleared = await rowOf(tx, m);
      expect([cleared.costCents, cleared.currency]).toEqual([null, null]);
    });
  });

  it("prices a receipt whatever its standing: pending, rejected or voided", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const pending = await lateReceiptIn(tx, d);
      const refused = await lateReceiptIn(tx, d);
      await decideAs(tx, refused.approvalId, admin.id, "rejected");
      const gone = await lateReceiptIn(tx, d);
      await decideAs(tx, gone.approvalId, admin.id, "approved");
      const voided = await correctionIn(tx, d, gone.materialId, d.foremanId, "void");
      await decideAs(tx, voided.approvalId, admin.id, "approved");
      await asTenant(tx, d.companyId);

      for (const id of [pending.materialId, refused.materialId, gone.materialId]) {
        expect(await setCost(tx, admin.who, id, usd(700))).toEqual({
          result: "saved",
          cost: usd(700),
        });
      }
    });
  });

  it("leaves approvals, corrections, the day's review and the audit log as they were", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const onDay = await materialIn(tx, d, d.J, ON_D);
      const late = await lateReceiptIn(tx, d);
      await correctionIn(tx, d, late.materialId, d.foremanId);
      await asTenant(tx, d.companyId);

      const review = async () =>
        (await appCallerIn(tx, admin.who).closeout.review({ jobId: d.J, workDate: D }))
          .fingerprint;
      const state = async () => ({
        approvals: await tx.select().from(approvals).orderBy(asc(approvals.id)),
        corrections: await tx
          .select()
          .from(materialCorrections)
          .orderBy(asc(materialCorrections.id)),
        closeouts: await tx.select().from(dayCloseouts),
        audit: await auditRowsIn(tx, d.companyId),
      });
      const fingerprint = await review();
      const before = await state();
      expect(before.approvals).toHaveLength(2);

      await setCost(tx, admin.who, onDay, usd(8999));
      await setCost(tx, admin.who, late.materialId, usd(1250));
      await setCost(tx, admin.who, onDay, null);
      await setCost(tx, admin.who, onDay, usd(9000));

      expect(await state()).toEqual(before);
      expect(before.audit).toEqual([]);
      // Cost is not something the day's review covers (fingerprint: every fact but cost).
      expect(await review()).toBe(fingerprint);
    });
  });

  it("refuses a receipt the caller cannot see, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const theirs = await materialIn(tx, other, other.J, ON_D);
      await asTenant(tx, d.companyId);

      expect(await outcome(setCost(tx, admin.who, theirs, usd(1)))).toBe("FORBIDDEN");
      expect(await outcome(setCost(tx, admin.who, uuidv7(), usd(1)))).toBe("FORBIDDEN");
      await tx.execute(sql`reset role`);
      const row = await rowOf(tx, theirs);
      expect([row.costCents, row.currency]).toEqual([null, null]);
    });
  });

  it("admits an active admin only", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      const m = await materialIn(tx, d, d.J, ON_D, worker.id);
      await asTenant(tx, d.companyId);

      // Not the receipt's own logger, and not the job's foreman.
      expect(await outcome(setCost(tx, worker.who, m, usd(1)))).toBe("FORBIDDEN");
      expect(await outcome(setCost(tx, d.who, m, usd(1)))).toBe("FORBIDDEN");
      expect(await outcome(setCost(tx, gone.who, m, usd(1)))).toBe("UNAUTHORIZED");
      await asTenant(tx, d.companyId);
      expect((await rowOf(tx, m)).costCents).toBeNull();
    });
  });

  it("refuses a malformed cost as BAD_REQUEST", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const m = await materialIn(tx, d, d.J, ON_D);
      await asTenant(tx, d.companyId);

      for (const bad of [
        { cents: -1, currency: "USD" },
        { cents: 10.5, currency: "USD" },
        { cents: 2147483648, currency: "USD" },
        { cents: "100", currency: "USD" },
        { cents: 100, currency: "usd" },
        { cents: 100, currency: "US" },
        { cents: 100 },
        { currency: "USD" },
        { cents: 100, currency: "USD", note: "extra" },
        undefined,
      ]) {
        expect([bad, await outcome(setCost(tx, admin.who, m, bad))]).toEqual([
          bad,
          "BAD_REQUEST",
        ]);
      }
      await asTenant(tx, d.companyId);
      expect((await rowOf(tx, m)).costCents).toBeNull();
    });
  });
});
