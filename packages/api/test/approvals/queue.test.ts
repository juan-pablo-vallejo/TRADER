// Stage 3 line 8: approval.queue, the admin's pending approvals of every subject, under the
// runtime role in rolled-back transactions.
import { approvals } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";

import {
  appCallerIn,
  becomeApp,
  boundIn,
  correctionIn,
  crewDayIn,
  eventIn,
  lateReceiptIn,
  outcome,
  ownerDb,
  pendingApproval,
  rolledBack,
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

const T = (hhmm: string) => `2026-10-05T${hhmm}:00Z`;
const queue = (tx: Tx, who: unknown, input: { after?: string; limit?: number } = {}) =>
  appCallerIn(tx, who).approval.queue(input);

async function decideAs(tx: Tx, approvalId: string, by: string, decision = "approved") {
  await tx
    .update(approvals)
    .set({
      decision: decision as "approved" | "rejected",
      decidedAt: new Date(),
      decidedByUserId: by,
    })
    .where(eq(approvals.id, approvalId));
}

// A started-and-ended session for `worker` on J, its start's approval pending.
async function pendingSession(tx: Tx, d: CrewDay, worker: string, initiator?: string) {
  const start = await eventIn(tx, d, {
    worker,
    job: d.J,
    type: "started",
    client: T("12:00"),
    ...(initiator === undefined ? {} : { initiator }),
  });
  const end = await eventIn(tx, d, {
    worker,
    job: d.J,
    type: "ended",
    client: T("16:00"),
  });
  const approvalId = await pendingApproval(tx, d.companyId, { eventId: start }, [
    "offline",
    "location",
  ]);
  return { start, end, approvalId };
}

describe("approval.queue", () => {
  it("lists every pending subject with its stored reasons, and nothing decided or row-less", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const labor = await pendingSession(tx, d, d.w1);
      const receipt = await lateReceiptIn(tx, d);
      const correction = await correctionIn(tx, d, receipt.materialId, d.foremanId);
      const decided = await pendingSession(tx, d, d.w2);
      await decideAs(tx, decided.approvalId, admin.id);
      await becomeApp(tx);
      const { items, next } = await queue(tx, admin.who);
      expect(next).toBeNull();
      expect(items.map((i) => [i.approvalId, i.subject.kind, i.reasons])).toEqual([
        [labor.approvalId, "labor_event", ["offline", "location"]],
        [receipt.approvalId, "material", ["after_closeout"]],
        [correction.approvalId, "material_correction", ["corrected"]],
      ]);
      const [event, material, corrected] = items.map((i) => i.subject);
      expect(event).toMatchObject({
        eventId: labor.start,
        type: "started",
        worker: { id: d.w1, name: "w1" },
        job: { id: d.J, name: "J" },
        effect: "in_effect",
        session: {
          rootEventId: labor.start,
          workDate: "2026-10-05",
          state: "ended",
          complete: true,
          structuralWorkedMs: 4 * 3_600_000,
          accounting: "pending",
          eligibleWorkedMs: 0,
        },
      });
      expect(material).toMatchObject({
        materialId: receipt.materialId,
        original: { quantity: "2.000" },
        accounting: "pending",
      });
      expect(corrected).toMatchObject({
        correctionId: correction.correctionId,
        submittedBy: { id: d.foremanId },
        correction: { kind: "amend", quantity: "3.000" },
        // Pending, so not yet in effect.
        effective: { quantity: "2.000", voided: false },
      });
      // No coordinates or cost cross.
      expect(JSON.stringify(items)).not.toMatch(/location_lat|locationLat|cost/i);
    });
  });

  it("shows only the caller's tenant", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const other = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const mine = await pendingSession(tx, d, d.w1);
      await pendingSession(tx, other, other.w1);
      const theirs = await lateReceiptIn(tx, other);
      await becomeApp(tx);
      const { items } = await queue(tx, admin.who);
      expect(items.map((i) => i.approvalId)).toEqual([mine.approvalId]);
      // Another tenant's id as a cursor is an empty page, not an answer about it.
      expect((await queue(tx, admin.who, { after: theirs.approvalId })).items).toEqual(
        [],
      );
    });
  });

  it("pages by approval id over rows sharing one created_at, each exactly once", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      // One transaction: every row's created_at is the same now().
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) ids.push((await lateReceiptIn(tx, d)).approvalId);
      await becomeApp(tx);
      const all = await queue(tx, admin.who);
      expect(new Set(all.items.map((i) => i.createdAt.getTime())).size).toBe(1);
      expect(all.items.map((i) => i.approvalId)).toEqual([...ids].sort());
      const seen: string[] = [];
      let after: string | undefined;
      for (;;) {
        const page = await queue(tx, admin.who, {
          limit: 1,
          ...(after ? { after } : {}),
        });
        seen.push(...page.items.map((i) => i.approvalId));
        if (page.next === null) break;
        after = page.next;
      }
      expect(seen).toEqual([...ids].sort());
    });
  });

  it("marks the caller's own entries: their labor, never labor they only recorded", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const ownLabor = await pendingSession(tx, d, admin.id, d.foremanId);
      const recorded = await pendingSession(tx, d, d.w2, admin.id);
      const ownReceipt = await lateReceiptIn(tx, d, admin.id);
      const correctedByForeman = await correctionIn(
        tx,
        d,
        ownReceipt.materialId,
        d.foremanId,
      );
      const other = await lateReceiptIn(tx, d);
      const ownCorrection = await correctionIn(tx, d, other.materialId, admin.id);
      await becomeApp(tx);
      const own = new Map(
        (await queue(tx, admin.who)).items.map((i) => [i.approvalId, i.ownEntry]),
      );
      expect(own.get(ownLabor.approvalId)).toBe(true);
      expect(own.get(recorded.approvalId)).toBe(false);
      expect(own.get(ownReceipt.approvalId)).toBe(true);
      expect(own.get(correctedByForeman.approvalId)).toBe(false);
      expect(own.get(other.approvalId)).toBe(false);
      expect(own.get(ownCorrection.approvalId)).toBe(true);
    });
  });

  it("lists a superseded correction and a void against their session, live", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      // w1: a session whose void awaits a decision.
      const root1 = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: T("12:00"),
      });
      await eventIn(tx, d, { worker: d.w1, job: d.J, type: "ended", client: T("16:00") });
      const v = await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "voided",
        client: T("17:00"),
        voids: root1,
        initiator: admin.id,
      });
      const voidApproval = await pendingApproval(tx, d.companyId, { eventId: v }, [
        "corrected",
      ]);
      // w2: two corrections of one start; the later-accepted one wins and is approved.
      const root2 = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: T("12:00"),
      });
      await eventIn(tx, d, { worker: d.w2, job: d.J, type: "ended", client: T("16:00") });
      const old = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: T("12:30"),
        server: T("17:00"),
        corrects: root2,
      });
      const winner = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: T("12:15"),
        server: T("18:00"),
        corrects: root2,
      });
      const oldApproval = await pendingApproval(tx, d.companyId, { eventId: old }, [
        "corrected",
      ]);
      await decideAs(
        tx,
        await pendingApproval(tx, d.companyId, { eventId: winner }, ["corrected"]),
        admin.id,
      );
      await becomeApp(tx);
      const items = new Map(
        (await queue(tx, admin.who)).items.map((i) => [i.approvalId, i.subject]),
      );
      expect(items.get(voidApproval)).toMatchObject({
        effect: "void",
        session: { rootEventId: root1, accounting: "pending", structuralWorkedMs: 0 },
      });
      expect(items.get(oldApproval)).toMatchObject({
        effect: "superseded",
        session: {
          rootEventId: root2,
          accounting: "eligible",
          eligibleWorkedMs: 3.75 * 3_600_000,
        },
      });
    });
  });

  it("admits an active admin only", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await becomeApp(tx);
      expect(await outcome(queue(tx, worker.who))).toBe("FORBIDDEN");
      expect(await outcome(queue(tx, d.who))).toBe("FORBIDDEN");
      expect(await outcome(queue(tx, gone.who))).toBe("UNAUTHORIZED");
    });
  });
});
