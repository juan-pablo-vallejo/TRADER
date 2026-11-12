// Stage 2 line 4: the approval queue, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The decided-row freeze is a trigger from
// migration 0004, so the update here goes through Drizzle like the office's will.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import { approvals, materials, users, workSessionEvents } from "../../src/schema";
import {
  asApp,
  company,
  fixture,
  one,
  pgError,
  rolledBack,
  sqlstate,
  started,
  type Tx,
  uuidv7,
} from "../helpers";

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

  // From pending, as the office decides: 0025 refuses an event's approval born decided before
  // any CHECK would see it.
  it("rejects a decision without decided_at", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      const office = await otherUser(tx, companyId);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId, eventId, reasons: ["user_timed"] })
          .returning({ id: approvals.id }),
      );
      const code = await sqlstate(
        tx
          .update(approvals)
          .set({ decision: "approved", decidedByUserId: office })
          .where(eq(approvals.id, row.id)),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses UPDATE of a decided row and the row survives", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      const office = await otherUser(tx, companyId);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId, eventId, reasons: ["offline", "location"] })
          .returning({ id: approvals.id }),
      );
      // The one legal update: pending → decided.
      await tx
        .update(approvals)
        .set({ decision: "rejected", decidedAt: new Date(), decidedByUserId: office })
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

  // The guard's lookup (0025) does not find the event in the row's company, and refuses
  // before the composite foreign key (23503) would.
  it("rejects an event of another company", async () => {
    await rolledBack(db, async (tx) => {
      const a = await queued(tx);
      const b = await queued(tx);
      expect(
        await refusal(
          tx
            .insert(approvals)
            .values({ companyId: a.companyId, eventId: b.eventId, reasons: ["offline"] }),
        ),
      ).toBe("23000 approvals_event_visible");
    });
  });
});

// Stage 3 line 7 (0021, 0022): an original receipt as a third subject, the NULL-reason ban on
// every row, and the deferred rule that an entry its own columns flag has its approval.
async function receipt(
  tx: Tx,
  refs: Awaited<ReturnType<typeof fixture>>,
  flags: { capturedOffline?: boolean; clockSkewed?: boolean } = {},
) {
  const id = uuidv7();
  await tx.insert(materials).values({
    id,
    companyId: refs.companyId,
    jobId: refs.jobId,
    loggedByUserId: refs.workerId,
    description: "Primer",
    quantity: "1",
    unit: "gal",
    loggedAt: new Date(),
    capturedOffline: flags.capturedOffline ?? false,
    clockSkewed: flags.clockSkewed ?? false,
    clockSkewMs: flags.clockSkewed ? 600_000 : 0,
  });
  return id;
}

async function otherUser(tx: Tx, companyId: string) {
  return one(
    await tx
      .insert(users)
      .values({ companyId, email: "office@co.test", name: "Office", role: "admin" })
      .returning({ id: users.id }),
  ).id;
}

// The constraint a failure names, from the pg error.
async function refusal(statement: Promise<unknown>) {
  const error = (await pgError(statement)) as { code?: string; constraint?: string };
  return `${error.code} ${error.constraint}`;
}

// Fires the named deferred check now, then defers it again: IMMEDIATE lasts to the
// transaction's end, and a later insert in it would be checked before its approval exists.
async function fire(sp: Tx, name: string) {
  await sp.execute(sql.raw(`set constraints ${name} immediate`));
  await sp.execute(sql.raw(`set constraints ${name} deferred`));
}

describe("approvals — receipts and approval facts", () => {
  it("takes exactly one of three subjects (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, ...refs } = await queued(tx);
      const materialId = await receipt(tx, { companyId, ...refs });
      const both = { companyId, eventId, materialId, reasons: ["offline" as const] };
      expect(
        await refusal(tx.transaction((sp) => sp.insert(approvals).values(both))),
      ).toBe("23514 approvals_one_subject");
      const none = { companyId, reasons: ["offline" as const] };
      expect(
        await refusal(tx.transaction((sp) => sp.insert(approvals).values(none))),
      ).toBe("23514 approvals_one_subject");
      await tx.insert(approvals).values({ companyId, materialId, reasons: ["offline"] });
    });
  });

  it("allows one row per receipt (23505), in the receipt's company (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx, { ...company, name: "Other Co" });
      const materialId = await receipt(tx, a);
      await tx
        .insert(approvals)
        .values({ companyId: a.companyId, materialId, reasons: ["clock_skewed"] });
      const again = { companyId: a.companyId, materialId, reasons: ["offline" as const] };
      expect(
        await sqlstate(tx.transaction((sp) => sp.insert(approvals).values(again))),
      ).toBe("23505");
      // In another company the receipt is not found by the guard's lookup, which refuses
      // before the composite foreign key (23503) would.
      const theirs = {
        companyId: b.companyId,
        materialId,
        reasons: ["offline" as const],
      };
      expect(
        await refusal(tx.transaction((sp) => sp.insert(approvals).values(theirs))),
      ).toBe("23000 approvals_material_receipt_visible");
    });
  });

  it("refuses a NULL reason for every subject (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, ...refs } = await queued(tx);
      const materialId = await receipt(tx, { companyId, ...refs });
      const withNull = (statement: ReturnType<typeof sql>) =>
        refusal(tx.transaction((sp) => sp.execute(statement)));
      expect(
        await withNull(sql`insert into approvals (company_id, event_id, reasons)
          values (${companyId}, ${eventId}, '{offline,NULL}')`),
      ).toBe("23514 approvals_reasons_no_null");
      expect(
        await withNull(sql`insert into approvals (company_id, material_id, reasons)
          values (${companyId}, ${materialId}, '{offline,NULL}')`),
      ).toBe("23514 approvals_reasons_no_null");
    });
  });

  it("accepts after_closeout, the label 0021 added", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      await tx
        .insert(approvals)
        .values({ companyId, eventId, reasons: ["after_closeout"] });
    });
  });

  it("writes a receipt's approval pending, never decided by its logger (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const office = await otherUser(tx, refs.companyId);
      const materialId = await receipt(tx, refs);
      const decided = {
        companyId: refs.companyId,
        materialId,
        reasons: ["offline" as const],
        decision: "approved" as const,
        decidedAt: new Date(),
        decidedByUserId: office,
      };
      expect(
        await refusal(tx.transaction((sp) => sp.insert(approvals).values(decided))),
      ).toBe("23000 approvals_material_receipt_born_pending");
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId: refs.companyId, materialId, reasons: ["offline"] })
          .returning({ id: approvals.id }),
      );
      const decide = (by: string) =>
        tx.transaction((sp) =>
          sp
            .update(approvals)
            .set({ decision: "approved", decidedAt: new Date(), decidedByUserId: by })
            .where(eq(approvals.id, row.id)),
        );
      expect(await refusal(decide(refs.workerId))).toBe(
        "23000 approvals_material_receipt_not_self_decided",
      );
      await decide(office);
    });
  });

  it("fixes a pending receipt approval's subject (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const first = await receipt(tx, refs);
      const second = await receipt(tx, refs);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId: refs.companyId, materialId: first, reasons: ["offline"] })
          .returning({ id: approvals.id }),
      );
      expect(
        await refusal(
          tx.transaction((sp) =>
            sp
              .update(approvals)
              .set({ materialId: second })
              .where(eq(approvals.id, row.id)),
          ),
        ),
      ).toBe("23000 approvals_subject_fixed");
    });
  });

  it("refuses a flagged event without an approval holding its reasons, at commit", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const flagged = (o: Partial<typeof workSessionEvents.$inferInsert>) => ({
        ...started(refs),
        ...o,
      });
      // Unflagged: nothing required.
      await tx.transaction(async (sp) => {
        await sp.insert(workSessionEvents).values(started(refs));
        await fire(sp, "work_session_events_approved");
      });
      // Each column alone, with no approval and with one missing its reason.
      for (const [o, reason] of [
        [{ capturedOffline: true }, "offline"],
        [{ timeSetByUser: true }, "user_timed"],
        [{ clockSkewed: true, clockSkewMs: 600_000 }, "clock_skewed"],
      ] as const) {
        const bare = flagged(o);
        expect(
          await refusal(
            tx.transaction(async (sp) => {
              await sp.insert(workSessionEvents).values(bare);
              await fire(sp, "work_session_events_approved");
            }),
          ),
        ).toBe("23000 work_session_events_approved");
        const wrong = flagged(o);
        const other = "location" as const;
        expect(
          await refusal(
            tx.transaction(async (sp) => {
              await sp.insert(workSessionEvents).values(wrong);
              await sp.insert(approvals).values({
                companyId: refs.companyId,
                eventId: wrong.id,
                reasons: [other],
              });
              await fire(sp, "work_session_events_approved");
            }),
          ),
        ).toBe("23000 work_session_events_approved");
        const right = flagged(o);
        await tx.transaction(async (sp) => {
          await sp.insert(workSessionEvents).values(right);
          await sp.insert(approvals).values({
            companyId: refs.companyId,
            eventId: right.id,
            reasons: ["location", reason],
          });
          await fire(sp, "work_session_events_approved");
        });
      }
    });
  });

  it("refuses a flagged receipt without an approval holding its reasons, at commit", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.transaction(async (sp) => {
        await receipt(sp, refs);
        await fire(sp, "materials_approved");
      });
      for (const [flags, reason] of [
        [{ capturedOffline: true }, "offline"],
        [{ clockSkewed: true }, "clock_skewed"],
      ] as const) {
        expect(
          await refusal(
            tx.transaction(async (sp) => {
              await receipt(sp, refs, flags);
              await fire(sp, "materials_approved");
            }),
          ),
        ).toBe("23000 materials_approved");
        await tx.transaction(async (sp) => {
          const materialId = await receipt(sp, refs, flags);
          await sp
            .insert(approvals)
            .values({ companyId: refs.companyId, materialId, reasons: [reason] });
          await fire(sp, "materials_approved");
        });
      }
    });
  });

  it("checks a receipt's approval under the runtime role in its tenant", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const materialId = await receipt(tx, refs, { capturedOffline: true });
      await asApp(tx, refs.companyId);
      await tx
        .insert(approvals)
        .values({ companyId: refs.companyId, materialId, reasons: ["offline"] });
      await fire(tx, "materials_approved");
    });
  });
});

// Stage 3 line 8 (0025): a labor event's approval is written pending and never decided by the
// worker whose labor it is; the initiator is not excluded.
describe("approvals — labor events (0025)", () => {
  it("writes an event's approval pending (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId } = await queued(tx);
      const office = await otherUser(tx, companyId);
      const decided = {
        companyId,
        eventId,
        reasons: ["offline" as const],
        decision: "approved" as const,
        decidedAt: new Date(),
        decidedByUserId: office,
      };
      expect(
        await refusal(tx.transaction((sp) => sp.insert(approvals).values(decided))),
      ).toBe("23000 approvals_event_born_pending");
    });
  });

  it("refuses the worker's decision and admits the initiator's and a third user's", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const foreman = one(
        await tx
          .insert(users)
          .values({
            companyId: refs.companyId,
            email: "f@co.test",
            name: "Foreman",
            role: "foreman",
          })
          .returning({ id: users.id }),
      ).id;
      const office = await otherUser(tx, refs.companyId);
      // Recorded by the foreman for the worker.
      const pending = async () => {
        const event = { ...started(refs), initiatorUserId: foreman };
        await tx.insert(workSessionEvents).values(event);
        return one(
          await tx
            .insert(approvals)
            .values({
              companyId: refs.companyId,
              eventId: event.id,
              reasons: ["offline"],
            })
            .returning({ id: approvals.id }),
        ).id;
      };
      const decide = (id: string, by: string) =>
        tx.transaction((sp) =>
          sp
            .update(approvals)
            .set({ decision: "approved", decidedAt: new Date(), decidedByUserId: by })
            .where(eq(approvals.id, id)),
        );
      const first = await pending();
      expect(await refusal(decide(first, refs.workerId))).toBe(
        "23000 approvals_event_not_self_decided",
      );
      await decide(first, foreman);
      // Session legality is the API's fold, not the table's, so a second start is fine here.
      const second = await pending();
      await decide(second, office);
      const rows = await tx
        .select({ decidedBy: approvals.decidedByUserId })
        .from(approvals)
        .orderBy(approvals.createdAt, approvals.id);
      expect(rows.map((r) => r.decidedBy).sort()).toEqual([foreman, office].sort());
    });
  });

  it("still refuses a deactivated worker's own decision and admits another's", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, workerId } = await queued(tx);
      const office = await otherUser(tx, companyId);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, workerId));
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId, eventId, reasons: ["offline"] })
          .returning({ id: approvals.id }),
      );
      const decide = (by: string) =>
        tx.transaction((sp) =>
          sp
            .update(approvals)
            .set({ decision: "rejected", decidedAt: new Date(), decidedByUserId: by })
            .where(eq(approvals.id, row.id)),
        );
      expect(await refusal(decide(workerId))).toBe(
        "23000 approvals_event_not_self_decided",
      );
      await decide(office);
    });
  });

  it("holds under trader_app with the tenant set", async () => {
    await rolledBack(db, async (tx) => {
      const { companyId, eventId, workerId } = await queued(tx);
      const office = await otherUser(tx, companyId);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId, eventId, reasons: ["offline"] })
          .returning({ id: approvals.id }),
      );
      await asApp(tx, companyId);
      const decide = (by: string) =>
        tx.transaction((sp) =>
          sp
            .update(approvals)
            .set({ decision: "approved", decidedAt: new Date(), decidedByUserId: by })
            .where(eq(approvals.id, row.id)),
        );
      expect(await refusal(decide(workerId))).toBe(
        "23000 approvals_event_not_self_decided",
      );
      await decide(office);
      expect(one(await tx.select().from(approvals)).decidedByUserId).toBe(office);
    });
  });
});

// Stage 3 line 9 (0026): an office repair — a correction or a void — has an approval holding
// `corrected` at commit, the labor sibling of 0020's rule for material corrections.
describe("approvals — labor repairs (0026)", () => {
  const CHECK = "work_session_events_repair_approved";

  it("refuses a correction or a void without an approval holding corrected", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const root = started(refs);
      await tx.insert(workSessionEvents).values(root);
      const correction = () => ({ ...started(refs), correctsEventId: root.id });
      const voiding = () => ({
        ...started(refs),
        type: "voided" as const,
        voidsEventId: root.id,
      });
      for (const make of [correction, voiding]) {
        const bare = make();
        expect(
          await refusal(
            tx.transaction(async (sp) => {
              await sp.insert(workSessionEvents).values(bare);
              await fire(sp, CHECK);
            }),
          ),
        ).toBe(`23000 ${CHECK}`);
        const wrong = make();
        expect(
          await refusal(
            tx.transaction(async (sp) => {
              await sp.insert(workSessionEvents).values(wrong);
              await sp.insert(approvals).values({
                companyId: refs.companyId,
                eventId: wrong.id,
                reasons: ["user_timed"],
              });
              await fire(sp, CHECK);
            }),
          ),
        ).toBe(`23000 ${CHECK}`);
        const right = make();
        await tx.transaction(async (sp) => {
          await sp.insert(workSessionEvents).values(right);
          await sp.insert(approvals).values({
            companyId: refs.companyId,
            eventId: right.id,
            reasons: ["corrected"],
          });
          await fire(sp, CHECK);
        });
      }
    });
  });

  // Nothing of an ordinary event: the WHEN queues no deferred event for one, which
  // work-session-events.test.ts proves by TRUNCATE answering 23000 after an ordinary insert
  // (a queued event would make it 55006).
  it("requires nothing of an ordinary event", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.transaction(async (sp) => {
        await sp.insert(workSessionEvents).values(started(refs));
        await fire(sp, CHECK);
      });
    });
  });

  it("checks a repair's approval under the runtime role in its tenant", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const root = started(refs);
      await tx.insert(workSessionEvents).values(root);
      await asApp(tx, refs.companyId);
      const correction = { ...started(refs), correctsEventId: root.id };
      await tx.insert(workSessionEvents).values(correction);
      await tx.insert(approvals).values({
        companyId: refs.companyId,
        eventId: correction.id,
        reasons: ["corrected"],
      });
      await fire(tx, CHECK);
    });
  });
});

// Stage 4 (0032, V1-D10 as amended): an admin's own labor needs no approval, so 0022's and
// 0026's checks stand down for an event whose worker is an admin unless a different admin
// wrote it. Everything else is refused as before.
describe("approvals — an admin's own labor (0032)", () => {
  const FLAGS = "work_session_events_approved";
  const REPAIR = "work_session_events_repair_approved";
  type Refs = Awaited<ReturnType<typeof fixture>>;

  async function person(tx: Tx, companyId: string, role: "admin" | "foreman" | "worker") {
    return one(
      await tx
        .insert(users)
        .values({ companyId, email: `${role}-${uuidv7()}@co.test`, name: role, role })
        .returning({ id: users.id }),
    ).id;
  }

  // One event of each kind the two checks cover, for `worker`, written by `initiator`.
  const kinds = (refs: Refs, rootId: string, worker: string, initiator: string) => {
    const base = () => ({
      ...started(refs),
      workerId: worker,
      initiatorUserId: initiator,
    });
    return [
      [FLAGS, () => ({ ...base(), capturedOffline: true })],
      [FLAGS, () => ({ ...base(), timeSetByUser: true })],
      [FLAGS, () => ({ ...base(), clockSkewed: true, clockSkewMs: 600_000 })],
      [REPAIR, () => ({ ...base(), correctsEventId: rootId })],
      [REPAIR, () => ({ ...base(), type: "voided" as const, voidsEventId: rootId })],
    ] as const;
  };

  // A root for `worker` to correct or void, itself needing nothing.
  async function rootOf(tx: Tx, refs: Refs, worker: string) {
    const root = { ...started(refs), workerId: worker, initiatorUserId: worker };
    await tx.insert(workSessionEvents).values(root);
    return root.id;
  }

  const bare = (tx: Tx, check: string, row: typeof workSessionEvents.$inferInsert) =>
    tx.transaction(async (sp) => {
      await sp.insert(workSessionEvents).values(row);
      await fire(sp, check);
    });

  it("requires no approval of an admin's own event, flagged, correcting or voiding", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const root = await rootOf(tx, refs, admin);
      for (const [check, make] of kinds(refs, root, admin, admin)) {
        await bare(tx, check, make());
      }
      expect(await tx.select().from(approvals)).toEqual([]);
    });
  });

  it("requires none of an admin's flagged event a foreman recorded", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const foreman = await person(tx, refs.companyId, "foreman");
      const root = await rootOf(tx, refs, admin);
      for (const [check, make] of kinds(refs, root, admin, foreman).slice(0, 3)) {
        await bare(tx, check, make());
      }
    });
  });

  it("still refuses an admin's event that another admin wrote", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const other = await person(tx, refs.companyId, "admin");
      const root = await rootOf(tx, refs, admin);
      for (const [check, make] of kinds(refs, root, admin, other)) {
        expect(await refusal(bare(tx, check, make()))).toBe(`23000 ${check}`);
      }
    });
  });

  it("still refuses a worker's and a foreman's, whoever wrote it", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      for (const role of ["worker", "foreman"] as const) {
        const who = await person(tx, refs.companyId, role);
        const root = await rootOf(tx, refs, who);
        for (const initiator of [who, admin]) {
          for (const [check, make] of kinds(refs, root, who, initiator)) {
            expect(await refusal(bare(tx, check, make()))).toBe(`23000 ${check}`);
          }
        }
      }
    });
  });

  it("judges the role as it is when the check runs, not as it later becomes", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const root = await rootOf(tx, refs, admin);
      const [check, make] = kinds(refs, root, admin, admin)[0]!;
      await bare(tx, check, make());
      // Demoted afterwards: the stored event is not judged again, and the next one is.
      await tx.update(users).set({ role: "worker" }).where(eq(users.id, admin));
      expect(await refusal(bare(tx, check, make()))).toBe(`23000 ${check}`);
    });
  });

  it("still accepts an approval for an admin's own event", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const event = {
        ...started(refs),
        workerId: admin,
        initiatorUserId: admin,
        capturedOffline: true,
      };
      await tx.transaction(async (sp) => {
        await sp.insert(workSessionEvents).values(event);
        await sp
          .insert(approvals)
          .values({ companyId: refs.companyId, eventId: event.id, reasons: ["offline"] });
        await fire(sp, FLAGS);
      });
    });
  });

  it("still refuses a flagged receipt an admin logged", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      expect(
        await refusal(
          tx.transaction(async (sp) => {
            await receipt(sp, { ...refs, workerId: admin }, { capturedOffline: true });
            await fire(sp, "materials_approved");
          }),
        ),
      ).toBe("23000 materials_approved");
    });
  });

  it("holds under trader_app in its tenant, and sees no admin without one", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const admin = await person(tx, refs.companyId, "admin");
      const root = await rootOf(tx, refs, admin);
      const asked = async () =>
        (
          await tx.execute<{ free: boolean }>(
            sql`select labor_event_needs_no_approval(${refs.companyId}, ${admin}, ${admin}) as free`,
          )
        ).rows[0]!.free;
      await asApp(tx);
      expect(await asked()).toBe(false);
      await asApp(tx, refs.companyId);
      expect(await asked()).toBe(true);
      for (const [check, make] of kinds(refs, root, admin, admin)) {
        await bare(tx, check, make());
      }
      const worker = kinds(refs, root, refs.workerId, refs.workerId).slice(0, 3);
      for (const [check, make] of worker) {
        expect(await refusal(bare(tx, check, make()))).toBe(`23000 ${check}`);
      }
    });
  });
});
