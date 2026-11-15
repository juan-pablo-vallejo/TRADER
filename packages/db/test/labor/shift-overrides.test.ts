// Weekly schedule, S2: shift_overrides and shift_override_history, asserted against the
// migrated container. Rolled-back transactions throughout; see helpers.ts. The catalog side —
// FORCE, the policies, the grant matrix — is row-level-security.test.ts's and
// app-role.test.ts's; whether an override is needed or allowed is the writers' (api
// assignments/eligibility.ts).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import {
  jobAssignments,
  shiftOverrideHistory,
  shiftOverrides,
  users,
} from "../../src/schema";
import {
  asApp,
  fixture,
  lockExclusive,
  one,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
} from "../helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;

async function shift(
  tx: Tx,
  refs: Refs,
  expectedStart: string,
  expectedEnd: string,
  over: Partial<typeof jobAssignments.$inferInsert> = {},
) {
  return one(
    await tx
      .insert(jobAssignments)
      .values({
        companyId: refs.companyId,
        userId: refs.workerId,
        jobId: refs.jobId,
        workDate: "2026-11-16",
        expectedStart,
        expectedEnd,
        ...over,
      })
      .returning({ id: jobAssignments.id }),
  ).id;
}

// Two overlapping shifts of the fixture's worker on one day.
async function pair(tx: Tx, refs: Refs) {
  return {
    holder: await shift(tx, refs, "07:00", "15:30"),
    yielding: await shift(tx, refs, "12:00", "17:00"),
  };
}

const override = (
  refs: Refs,
  holderId: string,
  yieldingId: string,
  over: Partial<typeof shiftOverrides.$inferInsert> = {},
): typeof shiftOverrides.$inferInsert => ({
  companyId: refs.companyId,
  holderId,
  yieldingId,
  reason: "Covering the afternoon",
  createdBy: refs.workerId,
  ...over,
});

const entry = (
  refs: Refs,
  shifts: { holder: string; yielding: string },
  over: Partial<typeof shiftOverrideHistory.$inferInsert> = {},
): typeof shiftOverrideHistory.$inferInsert => ({
  companyId: refs.companyId,
  overrideId: crypto.randomUUID(),
  action: "created",
  actorUserId: refs.workerId,
  reason: "Covering the afternoon",
  userId: refs.workerId,
  workDate: "2026-11-16",
  holderShiftId: shifts.holder,
  holderJobId: refs.jobId,
  holderStart: "07:00",
  holderEnd: "15:30",
  yieldingShiftId: shifts.yielding,
  yieldingJobId: refs.jobId,
  yieldingStart: "12:00",
  yieldingEnd: "17:00",
  ...over,
});

// A statement a guard refuses, run in a savepoint: its SQLSTATE and the constraint it names.
async function refused(tx: Tx, run: (sp: Tx) => Promise<unknown>) {
  const error = (await pgError(tx.transaction(run))) as {
    code?: string;
    constraint?: string;
  };
  return { code: error.code, constraint: error.constraint };
}

const inserting = (tx: Tx, row: typeof shiftOverrides.$inferInsert) =>
  pgError(tx.transaction((sp: Tx) => sp.insert(shiftOverrides).values(row))) as Promise<{
    code?: string;
    constraint?: string;
  }>;

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("shift_overrides", () => {
  it("decides between two shifts of one person on one day, once per pair", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { holder, yielding } = await pair(tx, refs);
      await tx.insert(shiftOverrides).values(override(refs, holder, yielding));
      for (const again of [
        override(refs, holder, yielding),
        override(refs, yielding, holder),
      ]) {
        const error = await inserting(tx, again);
        expect(error.code).toBe("23505");
        expect(error.constraint).toBe("shift_overrides_pair_unique");
      }
    });
  });

  it("refuses one shift against itself and a blank reason (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { holder, yielding } = await pair(tx, refs);
      const itself = await inserting(tx, override(refs, holder, holder));
      expect(itself.code).toBe("23514");
      expect(itself.constraint).toBe("shift_overrides_two_shifts");
      const blank = await inserting(
        tx,
        override(refs, holder, yielding, { reason: "  " }),
      );
      expect(blank.code).toBe("23514");
      expect(blank.constraint).toBe("shift_overrides_reason_not_blank");
    });
  });

  it("refuses shifts of two people, or of two days", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const { holder } = await pair(tx, refs);
      const other = one(
        await tx
          .insert(users)
          .values({ companyId: refs.companyId, email: "o@co.test", name: "Other" })
          .returning({ id: users.id }),
      );
      const theirs = await shift(tx, refs, "12:00", "17:00", { userId: other.id });
      const tomorrow = await shift(tx, refs, "12:00", "17:00", {
        workDate: "2026-11-17",
      });
      for (const yielding of [theirs, tomorrow]) {
        for (const row of [
          override(refs, holder, yielding),
          override(refs, yielding, holder),
        ]) {
          const error = await inserting(tx, row);
          expect(error.code).toBe("23000");
          expect(error.constraint).toBe("shift_overrides_same_person_day");
        }
      }
      // The same rule on a change: an override cannot be pointed at another day's shift.
      const second = await shift(tx, refs, "13:00", "18:00");
      const made = one(
        await tx
          .insert(shiftOverrides)
          .values(override(refs, holder, second))
          .returning({ id: shiftOverrides.id }),
      );
      expect(
        await refused(tx, (sp) =>
          sp.execute(
            sql`update shift_overrides set yielding_id = ${tomorrow} where id = ${made.id}`,
          ),
        ),
      ).toEqual({ code: "23000", constraint: "shift_overrides_same_person_day" });
    });
  });

  it("refuses a shift of another company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const mine = await pair(tx, a);
      const theirs = await pair(tx, b);
      const error = await inserting(tx, override(a, mine.holder, theirs.yielding));
      expect(error.code).toBe("23503");
      expect(error.constraint).toBe("shift_overrides_company_id_yielding_id_fk");
    });
  });

  it("goes when either of its shifts goes", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      for (const [which, workDate] of [
        ["holder", "2026-12-01"],
        ["yielding", "2026-12-02"],
      ] as const) {
        const shifts = {
          holder: await shift(tx, refs, "07:00", "15:30", { workDate }),
          yielding: await shift(tx, refs, "12:00", "17:00", { workDate }),
        };
        await tx
          .insert(shiftOverrides)
          .values(override(refs, shifts.holder, shifts.yielding));
        await tx.delete(jobAssignments).where(eq(jobAssignments.id, shifts[which]));
        expect(
          await tx
            .select({ id: shiftOverrides.id })
            .from(shiftOverrides)
            .where(eq(shiftOverrides.companyId, refs.companyId)),
        ).toHaveLength(0);
      }
    });
  });

  it("lets trader_app write its tenant's overrides and none of another's", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const mine = await pair(tx, a);
      const theirs = await pair(tx, b);
      await tx.insert(shiftOverrides).values(override(b, theirs.holder, theirs.yielding));
      await asApp(tx, a.companyId);
      await tx.insert(shiftOverrides).values(override(a, mine.holder, mine.yielding));
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.insert(shiftOverrides).values(override(b, theirs.yielding, theirs.holder)),
          ),
        ),
      ).toBe("42501");
      expect(
        await tx.select({ id: shiftOverrides.id }).from(shiftOverrides),
      ).toHaveLength(1);
      const edited = await tx.execute(sql`update shift_overrides set reason = 'Changed'`);
      expect(edited.rowCount).toBe(1);
      const gone = await tx.execute(sql`delete from shift_overrides`);
      expect(gone.rowCount).toBe(1);
      await tx.execute(sql`reset role`);
      const { rows } = await tx.execute<{ reason: string }>(
        sql`select reason from shift_overrides where company_id = ${b.companyId}`,
      );
      expect(rows).toEqual([{ reason: "Covering the afternoon" }]);
    });
  });
});

describe("shift_override_history", () => {
  it("outlives the override and both of its shifts", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shifts = await pair(tx, refs);
      const made = one(
        await tx
          .insert(shiftOverrides)
          .values(override(refs, shifts.holder, shifts.yielding))
          .returning({ id: shiftOverrides.id }),
      );
      await tx
        .insert(shiftOverrideHistory)
        .values(entry(refs, shifts, { overrideId: made.id }));
      await tx.delete(jobAssignments).where(eq(jobAssignments.companyId, refs.companyId));
      const kept = await tx
        .select({
          overrideId: shiftOverrideHistory.overrideId,
          holderShiftId: shiftOverrideHistory.holderShiftId,
          yieldingEnd: shiftOverrideHistory.yieldingEnd,
        })
        .from(shiftOverrideHistory)
        .where(eq(shiftOverrideHistory.companyId, refs.companyId));
      expect(kept).toEqual([
        { overrideId: made.id, holderShiftId: shifts.holder, yieldingEnd: "17:00:00" },
      ]);
    });
  });

  it("takes the three actions and a reason, and nothing else (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shifts = await pair(tx, refs);
      for (const action of ["created", "changed", "removed"]) {
        await tx.insert(shiftOverrideHistory).values(entry(refs, shifts, { action }));
      }
      const failing = (over: Partial<typeof shiftOverrideHistory.$inferInsert>) =>
        refused(tx, (sp) =>
          sp.insert(shiftOverrideHistory).values(entry(refs, shifts, over)),
        );
      expect(await failing({ action: "edited" })).toEqual({
        code: "23514",
        constraint: "shift_override_history_action",
      });
      expect(await failing({ reason: " " })).toEqual({
        code: "23514",
        constraint: "shift_override_history_reason_not_blank",
      });
    });
  });

  it("is never updated, deleted or truncated, by anyone", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const shifts = await pair(tx, refs);
      await tx.insert(shiftOverrideHistory).values(entry(refs, shifts));
      for (const statement of [
        sql`update shift_override_history set reason = 'Rewritten'`,
        sql`delete from shift_override_history`,
      ]) {
        const error = await pgError(tx.transaction((sp: Tx) => sp.execute(statement)));
        expect(error.message).toContain("append-only");
      }
      await lockExclusive(tx, ["shift_override_history"]);
      const truncated = await pgError(
        tx.transaction((sp: Tx) => sp.execute(sql`truncate shift_override_history`)),
      );
      expect(truncated.message).toContain("append-only");
    });
  });

  it("lets trader_app add and read its tenant's entries, and change none (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const a = await fixture(tx);
      const b = await fixture(tx);
      const mine = await pair(tx, a);
      const theirs = await pair(tx, b);
      await tx.insert(shiftOverrideHistory).values(entry(b, theirs));
      await asApp(tx, a.companyId);
      await tx.insert(shiftOverrideHistory).values(entry(a, mine));
      expect(
        await sqlstate(
          tx.transaction((sp: Tx) =>
            sp.insert(shiftOverrideHistory).values(entry(b, theirs)),
          ),
        ),
      ).toBe("42501");
      expect(
        await tx.select({ id: shiftOverrideHistory.id }).from(shiftOverrideHistory),
      ).toHaveLength(1);
      for (const statement of [
        sql`update shift_override_history set reason = 'Rewritten'`,
        sql`delete from shift_override_history`,
      ]) {
        expect(await sqlstate(tx.transaction((sp: Tx) => sp.execute(statement)))).toBe(
          "42501",
        );
      }
    });
  });
});
