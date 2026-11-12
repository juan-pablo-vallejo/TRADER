// Stage 4: material.list, the office's read of receipts and their cost, under the runtime
// role in rolled-back transactions. Fixtures are written as the owner; nothing is committed.
import { approvals, materials } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import {
  appCallerIn,
  becomeApp,
  boundIn,
  correctionIn,
  crewDayIn,
  lateReceiptIn,
  materialIn,
  outcome,
  ownerDb,
  rolledBack,
} from "../helpers";
import type { Tx } from "../../src/core/context";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

const T = (hhmm: string) => `2026-10-05T${hhmm}:00Z`;

type Input = {
  jobId?: string;
  show?: "unpriced" | "all";
  after?: string;
  limit?: number;
};
const list = (tx: Tx, who: unknown, input: Input = {}) =>
  appCallerIn(tx, who).material.list(input);

const price = (tx: Tx, id: string, costCents: number) =>
  tx.update(materials).set({ costCents, currency: "USD" }).where(eq(materials.id, id));

const decideAs = (tx: Tx, approvalId: string, by: string, decision: string) =>
  tx
    .update(approvals)
    .set({
      decision: decision as "approved" | "rejected",
      decidedAt: new Date(),
      decidedByUserId: by,
    })
    .where(eq(approvals.id, approvalId));

describe("material.list", () => {
  it("lists receipts newest first with their job, logger, facts and cost", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const early = await materialIn(tx, d, d.J, T("12:00"));
      const late = await materialIn(tx, d, d.K, T("15:00"), d.w2);
      await price(tx, early, 8999);
      await becomeApp(tx);

      const { items, next, timezone } = await list(tx, admin.who, { show: "all" });
      expect(timezone).toBe("America/New_York");
      expect(next).toBeNull();
      expect(items.map((i) => i.id)).toEqual([late, early]);
      expect(items[1]).toEqual({
        id: early,
        job: { id: d.J, name: "J" },
        loggedBy: { id: d.w1, name: "w1" },
        loggedAt: new Date(T("12:00")),
        original: { description: "Eggshell, white", quantity: "2.000", unit: "gal" },
        effective: {
          description: "Eggshell, white",
          quantity: "2.000",
          unit: "gal",
          voided: false,
        },
        accounting: "eligible",
        cost: { cents: 8999, currency: "USD" },
      });
      expect(items[0]).toMatchObject({
        job: { id: d.K, name: "K" },
        loggedBy: { id: d.w2, name: "w2" },
        cost: null,
      });
      expect(JSON.stringify(items)).not.toMatch(/captured|skew|location/i);
    });
  });

  it("shows only unpriced receipts unless asked for all", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const priced = await materialIn(tx, d, d.J, T("12:00"));
      const free = await materialIn(tx, d, d.J, T("13:00"));
      const open = await materialIn(tx, d, d.J, T("14:00"));
      await price(tx, priced, 100);
      // A receipt that cost nothing is priced: zero is a cost, NULL is none.
      await price(tx, free, 0);
      await becomeApp(tx);

      expect((await list(tx, admin.who)).items.map((i) => i.id)).toEqual([open]);
      expect(
        (await list(tx, admin.who, { show: "unpriced" })).items.map((i) => i.id),
      ).toEqual([open]);
      expect((await list(tx, admin.who, { show: "all" })).items.map((i) => i.id)).toEqual(
        [open, free, priced],
      );
    });
  });

  it("narrows to one job, and refuses a job the caller cannot see", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const onJ = await materialIn(tx, d, d.J, T("12:00"));
      await materialIn(tx, d, d.K, T("13:00"));
      await materialIn(tx, other, other.J, T("12:00"));
      await becomeApp(tx);

      expect((await list(tx, admin.who, { jobId: d.J })).items.map((i) => i.id)).toEqual([
        onJ,
      ]);
      expect(await outcome(list(tx, admin.who, { jobId: other.J }))).toBe("FORBIDDEN");
    });
  });

  it("shows only the caller's tenant", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const mine = await materialIn(tx, d, d.J, T("12:00"));
      const theirs = await materialIn(tx, other, other.J, T("12:00"));
      await becomeApp(tx);

      expect((await list(tx, admin.who)).items.map((i) => i.id)).toEqual([mine]);
      // Another tenant's id as a cursor is an empty page, not an answer about it.
      expect((await list(tx, admin.who, { after: theirs })).items).toEqual([]);
    });
  });

  it("pages by id over receipts sharing one logged_at, each exactly once", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) ids.push(await materialIn(tx, d, d.J, T("12:00")));
      const older = await materialIn(tx, d, d.J, T("09:00"));
      await becomeApp(tx);

      const expected = [...[...ids].sort().reverse(), older];
      expect((await list(tx, admin.who)).items.map((i) => i.id)).toEqual(expected);
      const seen: string[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await list(tx, admin.who, { limit: 2, ...(after ? { after } : {}) });
        expect(page.items.length).toBeLessThanOrEqual(2);
        seen.push(...page.items.map((i) => i.id));
        if (page.next === null) break;
        after = page.next;
      }
      expect(seen).toEqual(expected);
    });
  });

  it("shows a receipt's facts after its approved corrections, and whether it counts", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const plain = await materialIn(tx, d, d.J, T("09:00"));
      const pending = await lateReceiptIn(tx, d);
      const refused = await lateReceiptIn(tx, d);
      await decideAs(tx, refused.approvalId, admin.id, "rejected");
      // Approved, then amended: the amend is in effect once it is approved.
      const amended = await lateReceiptIn(tx, d);
      await decideAs(tx, amended.approvalId, admin.id, "approved");
      const amend = await correctionIn(tx, d, amended.materialId, d.foremanId);
      await decideAs(tx, amend.approvalId, admin.id, "approved");
      // An amend still waiting changes nothing.
      const waiting = await lateReceiptIn(tx, d);
      await decideAs(tx, waiting.approvalId, admin.id, "approved");
      await correctionIn(tx, d, waiting.materialId, d.foremanId);
      const gone = await lateReceiptIn(tx, d);
      await decideAs(tx, gone.approvalId, admin.id, "approved");
      const voided = await correctionIn(tx, d, gone.materialId, d.foremanId, "void");
      await decideAs(tx, voided.approvalId, admin.id, "approved");
      await becomeApp(tx);

      const { items } = await list(tx, admin.who);
      const of = (id: string) => items.find((i) => i.id === id)!;
      expect(of(plain).accounting).toBe("eligible");
      expect(of(pending.materialId).accounting).toBe("pending");
      expect(of(refused.materialId).accounting).toBe("rejected");
      expect(of(amended.materialId)).toMatchObject({
        accounting: "eligible",
        original: { description: "Eggshell, white", quantity: "2.000", unit: "gal" },
        effective: {
          description: "Primer, grey",
          quantity: "3.000",
          unit: "gal",
          voided: false,
        },
      });
      expect(of(waiting.materialId)).toMatchObject({
        accounting: "eligible",
        effective: { description: "Eggshell, white", voided: false },
      });
      expect(of(gone.materialId)).toMatchObject({
        accounting: "voided",
        effective: { voided: true },
      });
    });
  });

  it("admits an active admin only", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await becomeApp(tx);
      expect(await outcome(list(tx, worker.who))).toBe("FORBIDDEN");
      expect(await outcome(list(tx, d.who))).toBe("FORBIDDEN");
      expect(await outcome(list(tx, gone.who))).toBe("UNAUTHORIZED");
    });
  });
});
