// Stage 3 line 8: approval.decide, under the runtime role in rolled-back transactions. One
// decision per approval, by an active admin, never on their own entry; a decided row is
// answered, never rewritten. Concurrency is approvals/decide-commit.test.ts's.
import { approvals } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@trader/db";
import { users } from "@trader/db/schema";

import type { Tx } from "../../src/core/context";
import {
  appCallerIn,
  asTenant,
  boundIn,
  crewDayIn,
  eventIn,
  outcome,
  ownerDb,
  pendingApproval,
  rejection,
  rolledBack,
  uuidv7,
  type CrewDay,
} from "../helpers";

let owner: Db;
beforeAll(() => {
  owner = ownerDb();
});
afterAll(async () => {
  await owner.$client.end();
});

const T = (hhmm: string) => `2026-10-05T${hhmm}:00Z`;
type Decision = "approved" | "rejected";
const decide = (tx: Tx, who: unknown, approvalId: string, decision: Decision) =>
  appCallerIn(tx, who).approval.decide({ approvalId, decision });

const stored = async (tx: Tx, id: string) =>
  (await tx.select().from(approvals).where(eq(approvals.id, id)))[0]!;

// Back to the owner, then the runtime role again.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

async function laborApproval(tx: Tx, d: CrewDay, worker: string, initiator?: string) {
  const eventId = await eventIn(tx, d, {
    worker,
    job: d.J,
    type: "started",
    client: T("12:00"),
    ...(initiator === undefined ? {} : { initiator }),
  });
  return pendingApproval(tx, d.companyId, { eventId });
}

// Two pending labor approvals, one per worker, neither the admin's own.
async function world(tx: Tx) {
  const d = await crewDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const subjects = [await laborApproval(tx, d, d.w1), await laborApproval(tx, d, d.w2)];
  return { d, admin, subjects };
}

describe("approval.decide — decisions", () => {
  it("records approve and reject on every subject, decided by the caller at server time", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, subjects } = await world(tx);
      const more = await world(tx);
      await asTenant(tx, d.companyId);
      for (const [i, id] of subjects.entries()) {
        const decision: Decision = i % 2 === 0 ? "approved" : "rejected";
        const r = await decide(tx, admin.who, id, decision);
        expect(r).toMatchObject({ result: "decided", approval: { id, decision } });
        const row = await stored(tx, id);
        expect(row).toMatchObject({ decision, decidedByUserId: admin.id });
        expect(row.decidedAt).toEqual(
          r.result === "decided" ? r.approval.decidedAt : null,
        );
      }
      // And the other polarity in another company, its own admin deciding (each call sets
      // its own tenant).
      for (const [i, id] of more.subjects.entries()) {
        const decision: Decision = i % 2 === 0 ? "rejected" : "approved";
        expect((await decide(tx, more.admin.who, id, decision)).result).toBe("decided");
        expect((await stored(tx, id)).decision).toBe(decision);
      }
    });
  });

  it("answers the same decision by the same admin as a duplicate, unchanged", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, subjects } = await world(tx);
      await asTenant(tx, d.companyId);
      const first = await decide(tx, admin.who, subjects[0]!, "approved");
      const row = await stored(tx, subjects[0]!);
      const again = await decide(tx, admin.who, subjects[0]!, "approved");
      expect(again).toEqual({
        result: "duplicate",
        approval: first.result === "decided" ? first.approval : null,
      });
      expect(await stored(tx, subjects[0]!)).toEqual(row);
    });
  });

  it("refuses an opposite decision, and another admin's, with the standing one", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, subjects } = await world(tx);
      const second = await boundIn(tx, d.companyId, "admin");
      await asTenant(tx, d.companyId);
      await decide(tx, admin.who, subjects[1]!, "rejected");
      const row = await stored(tx, subjects[1]!);
      const standing = {
        decision: "rejected",
        decidedAt: row.decidedAt,
        decidedByUserId: admin.id,
      };
      expect(await decide(tx, admin.who, subjects[1]!, "approved")).toEqual({
        result: "rejected",
        code: "already_decided",
        standing,
      });
      expect(await decide(tx, second.who, subjects[1]!, "rejected")).toEqual({
        result: "rejected",
        code: "already_decided",
        standing,
      });
      expect(await stored(tx, subjects[1]!)).toEqual(row);
    });
  });
});

describe("approval.decide — own entries", () => {
  it("refuses the admin's own labor, whoever recorded it; admits labor they recorded", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const own = await laborApproval(tx, d, admin.id, d.foremanId);
      const recorded = await laborApproval(tx, d, d.w2, admin.id);
      await asTenant(tx, d.companyId);
      const row = await stored(tx, own);
      expect(await decide(tx, admin.who, own, "approved")).toEqual({
        result: "rejected",
        code: "own_entry",
      });
      expect(await stored(tx, own)).toEqual(row);
      expect((await decide(tx, admin.who, recorded, "approved")).result).toBe("decided");
    });
  });

  it("decides a deactivated worker's entries", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, subjects } = await world(tx);
      await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1));
      await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w2));
      await asTenant(tx, d.companyId);
      for (const id of subjects) {
        expect((await decide(tx, admin.who, id, "approved")).result).toBe("decided");
      }
    });
  });
});

describe("approval.decide — who may call", () => {
  it("gives a missing id, another tenant's id and a worker one identical FORBIDDEN", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, admin, subjects } = await world(tx);
      const theirs = await world(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const gone = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await asTenant(tx, d.companyId);
      const shape = async (who: unknown, id: string) => {
        const e = await rejection(decide(tx, who, id, "approved"));
        return { code: e.code, message: e.message };
      };
      const missing = await shape(admin.who, uuidv7());
      expect(missing).toEqual({ code: "FORBIDDEN", message: "Not permitted." });
      expect(await shape(admin.who, theirs.subjects[0]!)).toEqual(missing);
      expect(await shape(worker.who, subjects[0]!)).toEqual(missing);
      expect(await shape(d.who, subjects[0]!)).toEqual(missing);
      expect(await outcome(decide(tx, gone.who, subjects[0]!, "approved"))).toBe(
        "UNAUTHORIZED",
      );
      await asOwner(tx, d, async () => {
        for (const id of [...subjects, ...theirs.subjects]) {
          expect((await stored(tx, id)).decision).toBeNull();
        }
      });
    });
  });
});
