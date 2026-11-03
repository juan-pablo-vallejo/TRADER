// Stage 2 line 4: the approval queue, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The decided-row freeze is a trigger from
// migration 0004, so the update here goes through Drizzle like the office's will.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import { approvals, workSessionEvents } from "../src/schema";
import { fixture, one, pgError, rolledBack, sqlstate, started, type Tx } from "./helpers";

// One event in the queue's company, as the push handler will have written it.
async function queued(tx: Tx) {
  const refs = await fixture(tx);
  const event = started(refs);
  await tx.insert(workSessionEvents).values(event);
  return { ...refs, eventId: event.id };
}

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("approvals", () => {
  it("rejects an empty reasons array", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      const code = await sqlstate(
        tx.insert(approvals).values({ companyId, eventId, reasons: [] }),
      );
      expect(code).toBe("23514");
    });
  });

  it("rejects a second row for one event", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      await tx.insert(approvals).values({ companyId, eventId, reasons: ["offline"] });
      const code = await sqlstate(
        tx.insert(approvals).values({ companyId, eventId, reasons: ["location"] }),
      );
      expect(code).toBe("23505");
    });
  });

  it("rejects a decision without decided_at", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, workerId } = await queued(tx);
      const code = await sqlstate(
        tx.insert(approvals).values({
          companyId,
          eventId,
          reasons: ["user_timed"],
          decision: "approved",
          decidedByUserId: workerId,
        }),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses UPDATE of a decided row and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, workerId } = await queued(tx);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId, eventId, reasons: ["offline", "location"] })
          .returning({ id: approvals.id }),
      );
      // The one legal update: pending → decided.
      await tx
        .update(approvals)
        .set({ decision: "rejected", decidedAt: new Date(), decidedByUserId: workerId })
        .where(eq(approvals.id, row.id));
      const error = await pgError(
        tx.transaction((sp) =>
          sp
            .update(approvals)
            .set({ decision: "approved" })
            .where(eq(approvals.id, row.id)),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "approvals row is frozen once decision is set: UPDATE rejected",
      );
      expect(one(await tx.select().from(approvals)).decision).toBe("rejected");
    });
  });

  it("rejects an event of another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = await queued(tx);
      const b = await queued(tx);
      const code = await sqlstate(
        tx
          .insert(approvals)
          .values({ companyId: a.companyId, eventId: b.eventId, reasons: ["offline"] }),
      );
      expect(code).toBe("23503");
    });
  });
});
