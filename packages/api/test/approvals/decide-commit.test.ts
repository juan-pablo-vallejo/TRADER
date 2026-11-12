// Stage 3 line 8: approval.decide against real commits. Rolled-back tests cannot show two
// connections serializing; these do, in a database of their own (helpers.ts, disposableDb).
// A holder transaction takes a lock first; the decisions are started against it, seen waiting
// in pg_stat_activity (waitForLockWait, no sleeps), and the holder then commits or rolls back.
import { approvals, users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContext, type Tx } from "../../src/core/context";
import type { VerifiedIdentity } from "../../src/core/identity";
import { lockCompanyFieldWrites } from "../../src/labor/timeline";
import { appRouter } from "../../src/router";
import { createCallerFactory } from "../../src/core/trpc";
import {
  boundIn,
  correctionIn,
  crewDayIn,
  disposableDb,
  eventIn,
  lateReceiptIn,
  outcome,
  pendingApproval,
  waitForLockWait,
  quietReporter,
  REQUEST_ID,
} from "../helpers";

let D: Awaited<ReturnType<typeof disposableDb>>;
let app: ReturnType<typeof D.app>;

beforeAll(async () => {
  D = await disposableDb();
  app = D.app();
}, 60_000);
afterAll(async () => {
  await D.drop();
});

const decide = (
  who: VerifiedIdentity,
  approvalId: string,
  decision: "approved" | "rejected",
) =>
  createCallerFactory(appRouter)(
    createContext({
      db: app,
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
    }),
  ).approval.decide({
    approvalId,
    decision,
  });

// Committed: two admins, and one pending approval of each subject.
async function world() {
  return D.owner.transaction(async (tx) => {
    const d = await crewDayIn(tx);
    const x = await boundIn(tx, d.companyId, "admin");
    const y = await boundIn(tx, d.companyId, "admin");
    const eventId = await eventIn(tx, d, {
      worker: d.w1,
      job: d.J,
      type: "started",
      client: "2026-10-05T12:00:00Z",
    });
    const labor = await pendingApproval(tx, d.companyId, { eventId });
    const receipt = await lateReceiptIn(tx, d);
    const correction = await correctionIn(tx, d, receipt.materialId, d.foremanId);
    return { d, x, y, labor, receipt, correction };
  });
}

// Runs `body` in an owner transaction that stays open until `release` is called; it then
// commits, or rolls back when `commit` is false.
function hold(body: (tx: Tx) => Promise<unknown>, commit = false) {
  let release: () => void = () => {};
  const released = new Promise<void>((r) => (release = r));
  let ready: () => void = () => {};
  const held = new Promise<void>((r) => (ready = r));
  const done = D.owner
    .transaction(async (tx) => {
      await body(tx);
      ready();
      await released;
      if (!commit) tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error && error.message.includes("Rollback"))) throw error;
    });
  return { held, release: async () => (release(), await done) };
}

const stored = async (id: string) =>
  (await D.owner.select().from(approvals).where(eq(approvals.id, id)))[0]!;

describe("approval.decide — real commits", () => {
  it("lets one of two admins decide; the other gets the standing decision", async () => {
    const w = await world();
    const h = hold((tx) =>
      tx.execute(sql`select 1 from approvals where id = ${w.labor} for update`),
    );
    await h.held;
    const approve = decide(w.x.who, w.labor, "approved");
    const reject = decide(w.y.who, w.labor, "rejected");
    await waitForLockWait(D.owner, '%from "approvals"%for no key update%', { n: 2 });
    await h.release();
    const results = await Promise.all([approve, reject]);
    const row = await stored(w.labor);
    const winner = results.find((r) => r.result === "decided");
    const loser = results.find((r) => r.result === "rejected");
    expect(winner).toBeDefined();
    expect(loser).toEqual({
      result: "rejected",
      code: "already_decided",
      standing: {
        decision: row.decision,
        decidedAt: row.decidedAt,
        decidedByUserId: row.decidedByUserId,
      },
    });
    expect(winner).toEqual({
      result: "decided",
      approval: { id: w.labor, decision: row.decision, decidedAt: row.decidedAt },
    });
  });

  it("refuses an admin demoted while the decision waited, and decides nothing", async () => {
    const w = await world();
    const h = hold(
      (tx) => tx.update(users).set({ role: "worker" }).where(eq(users.id, w.x.id)),
      true,
    );
    await h.held;
    const call = outcome(decide(w.x.who, w.labor, "approved"));
    await waitForLockWait(D.owner, '%from "users"%for share%');
    await h.release();
    expect(await call).toBe("FORBIDDEN");
    expect((await stored(w.labor)).decision).toBeNull();
  });

  it("refuses an admin deactivated while the decision waited, and decides nothing", async () => {
    const w = await world();
    const h = hold(
      (tx) =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, w.x.id)),
      true,
    );
    await h.held;
    const call = outcome(decide(w.x.who, w.labor, "approved"));
    await waitForLockWait(D.owner, '%from "users"%for share%');
    await h.release();
    expect(await call).toBe("UNAUTHORIZED");
    expect((await stored(w.labor)).decision).toBeNull();
  });

  it("decides a correction behind its material's row lock; labor and receipts do not wait", async () => {
    const w = await world();
    const h = hold((tx) =>
      tx.execute(
        sql`select 1 from materials where id = ${w.receipt.materialId} for update`,
      ),
    );
    await h.held;
    // Neither takes the material lock, the receipt's own decision included.
    expect((await decide(w.x.who, w.labor, "approved")).result).toBe("decided");
    expect((await decide(w.x.who, w.receipt.approvalId, "approved")).result).toBe(
      "decided",
    );
    const correction = decide(w.x.who, w.correction.approvalId, "approved");
    await waitForLockWait(D.owner, '%from "materials"%for no key update%');
    await h.release();
    expect((await correction).result).toBe("decided");
  });

  it("decides a correction only once a closeout's exclusive field-write lock is gone", async () => {
    const w = await world();
    const h = hold(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${w.d.companyId}, true)`);
      await lockCompanyFieldWrites(tx, "exclusive");
    });
    await h.held;
    const correction = decide(w.x.who, w.correction.approvalId, "rejected");
    await waitForLockWait(D.owner, "%pg_advisory_xact_lock_shared%", {
      waitEvent: "advisory",
    });
    await h.release();
    expect((await correction).result).toBe("decided");
  });
});
