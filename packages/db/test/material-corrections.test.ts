// Stage 3 line 6: material corrections and their approvals, asserted against the migrated
// container. Rolled-back transactions throughout; see helpers.ts. The approval requirement is a
// deferred constraint trigger, which a rolled-back transaction never reaches, so tests that want
// it checked say SET CONSTRAINTS … IMMEDIATE.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../src/client";
import {
  approvals,
  dayCloseoutMaterials,
  dayCloseouts,
  materialCorrections,
  materials,
  users,
  workSessionEvents,
} from "../src/schema";
import {
  asApp,
  company,
  fixture,
  lockExclusive,
  one,
  pgError,
  rolledBack,
  sqlstate,
  started,
  type Tx,
  uuidv7,
} from "./helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;
type CorrectionInsert = typeof materialCorrections.$inferInsert;

async function material(tx: Tx, refs: Refs) {
  const id = uuidv7();
  await tx.insert(materials).values({
    id,
    companyId: refs.companyId,
    jobId: refs.jobId,
    loggedByUserId: refs.workerId,
    description: "Eggshell, white",
    quantity: "2.000",
    unit: "gal",
    loggedAt: new Date("2026-10-19T15:00:00Z"),
  });
  return id;
}

// A company with a material its closeout covers, and an office user who may decide.
async function covered(tx: Tx, values = company) {
  const refs = await fixture(tx, values);
  const materialId = await material(tx, refs);
  const closeoutId = uuidv7();
  await tx.insert(dayCloseouts).values({
    id: closeoutId,
    companyId: refs.companyId,
    jobId: refs.jobId,
    workDate: "2026-10-19",
    timezone: "America/New_York",
    jobStatus: "open",
    jobStatusApplied: true,
    submittedByUserId: refs.workerId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 0,
    materialCount: 1,
  });
  await tx.insert(dayCloseoutMaterials).values({
    companyId: refs.companyId,
    closeoutId,
    jobId: refs.jobId,
    materialId,
  });
  const adminId = one(
    await tx
      .insert(users)
      .values({
        companyId: refs.companyId,
        email: "admin@co.test",
        name: "Admin",
        role: "admin",
      })
      .returning({ id: users.id }),
  ).id;
  return { ...refs, materialId, adminId };
}

type Covered = Awaited<ReturnType<typeof covered>>;

const amend = (
  refs: Covered,
  values: Partial<CorrectionInsert> = {},
): CorrectionInsert => ({
  id: uuidv7(),
  companyId: refs.companyId,
  materialId: refs.materialId,
  kind: "amend",
  description: "Eggshell, white",
  quantity: "3.000",
  unit: "gal",
  note: null,
  submittedByUserId: refs.workerId,
  clientTimestamp: new Date(),
  serverTimestamp: new Date(),
  ...values,
});

const voiding = (
  refs: Covered,
  values: Partial<CorrectionInsert> = {},
): CorrectionInsert =>
  amend(refs, { kind: "void", description: null, quantity: null, unit: null, ...values });

// A correction with its pending approval, as material.correct writes them.
async function corrected(tx: Tx, refs: Covered, row = amend(refs)) {
  await tx.insert(materialCorrections).values(row);
  const approval = one(
    await tx
      .insert(approvals)
      .values({
        companyId: refs.companyId,
        materialCorrectionId: row.id,
        reasons: ["corrected"],
      })
      .returning({ id: approvals.id }),
  );
  return { correctionId: row.id!, approvalId: approval.id };
}

// Fires every deferred check now, in a savepoint so a failure leaves the test running.
const immediate = (sp: Tx) => sp.execute(sql`set constraints all immediate`);

const failing = (tx: Tx, statement: (sp: Tx) => Promise<unknown>) =>
  sqlstate(tx.transaction(statement));

let db: Db;
beforeAll(() => {
  db = createDb();
});
afterAll(async () => {
  await db.$client.end();
});

describe("material_corrections", () => {
  it("accepts an amend and a void of a covered material, each with its approval", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      await corrected(tx, refs);
      await corrected(tx, refs, voiding(refs));
      await immediate(tx);
      expect(await tx.select().from(materialCorrections)).toHaveLength(2);
    });
  });

  it("refuses a material no closeout covers (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const loose = await material(tx, refs);
      expect(
        await failing(tx, (sp) =>
          sp.insert(materialCorrections).values(amend(refs, { materialId: loose })),
        ),
      ).toBe("23503");
    });
  });

  it("keeps the material and the submitter in the company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const theirs = await covered(tx, { ...company, name: "Other Co" });
      expect(
        await failing(tx, (sp) =>
          sp
            .insert(materialCorrections)
            .values(amend(refs, { materialId: theirs.materialId })),
        ),
      ).toBe("23503");
      expect(
        await failing(tx, (sp) =>
          sp
            .insert(materialCorrections)
            .values(amend(refs, { submittedByUserId: theirs.workerId })),
        ),
      ).toBe("23503");
    });
  });

  it("refuses an amend missing any of description, quantity, unit (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      for (const missing of [{ description: null }, { quantity: null }, { unit: null }]) {
        expect(
          await failing(tx, (sp) =>
            sp.insert(materialCorrections).values(amend(refs, missing)),
          ),
        ).toBe("23514");
      }
    });
  });

  it("refuses a void carrying any of description, quantity, unit (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      for (const carried of [
        { description: "x" },
        { quantity: "1.000" },
        { unit: "gal" },
      ]) {
        expect(
          await failing(tx, (sp) =>
            sp.insert(materialCorrections).values(voiding(refs, carried)),
          ),
        ).toBe("23514");
      }
    });
  });

  it("refuses a non-positive quantity, blank text, a long note, a non-v7 id (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      for (const bad of [
        { quantity: "0" },
        { quantity: "-1" },
        { description: "  " },
        { unit: "" },
        { note: " " },
        { note: "x".repeat(2001) },
        { id: crypto.randomUUID() },
      ]) {
        expect(
          await failing(tx, (sp) =>
            sp.insert(materialCorrections).values(amend(refs, bad)),
          ),
        ).toBe("23514");
      }
      await tx
        .insert(materialCorrections)
        .values(amend(refs, { note: "x".repeat(2000) }));
    });
  });

  it("refuses a correction with no approval at commit (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      await tx.insert(materialCorrections).values(amend(refs));
      const error = await pgError(tx.transaction(immediate));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("needs its approvals row");
    });
  });

  it("refuses TRUNCATE, which bypasses row triggers, as the owner (23000)", async () => {
    // No fixture: the guard is statement-level, so it fires on an empty table, and a table
    // with pending deferred trigger events would refuse TRUNCATE with 55006 first. CASCADE
    // reaches approvals, as work_session_events' own test does; both held first, without
    // waiting (helpers.ts, lockExclusive).
    await rolledBack(db, async (tx) => {
      await lockExclusive(tx, ["material_corrections", "approvals"]);
      const error = await pgError(
        tx.transaction((sp) => sp.execute(sql`truncate material_corrections cascade`)),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toBe(
        "material_corrections is append-only: TRUNCATE rejected",
      );
    });
  });

  it("refuses UPDATE and DELETE as the owner (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const { correctionId } = await corrected(tx, refs);
      const where = eq(materialCorrections.id, correctionId);
      expect(
        await failing(tx, (sp) =>
          sp.update(materialCorrections).set({ unit: "qt" }).where(where),
        ),
      ).toBe("23000");
      expect(await failing(tx, (sp) => sp.delete(materialCorrections).where(where))).toBe(
        "23000",
      );
    });
  });

  it("refuses UPDATE and DELETE to trader_app by privilege (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      await corrected(tx, refs);
      await asApp(tx, refs.companyId);
      expect(
        await failing(tx, (sp) => sp.update(materialCorrections).set({ unit: "qt" })),
      ).toBe("42501");
      expect(await failing(tx, (sp) => sp.delete(materialCorrections))).toBe("42501");
    });
  });

  it("confines trader_app to its tenant: reads and writes", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const theirs = await covered(tx, { ...company, name: "Other Co" });
      await corrected(tx, theirs);
      await asApp(tx, refs.companyId);
      expect(await tx.select().from(materialCorrections)).toHaveLength(0);
      expect(
        await failing(tx, (sp) =>
          sp
            .insert(materialCorrections)
            .values(amend(theirs, { submittedByUserId: theirs.workerId })),
        ),
      ).toBe("42501");
      await corrected(tx, refs);
      await immediate(tx);
      expect(await tx.select().from(materialCorrections)).toHaveLength(1);
    });
  });

  it("leaves the covered material's row untouched", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const before = await tx.execute(
        sql`select to_jsonb(m) as row from materials m where id = ${refs.materialId}`,
      );
      await corrected(tx, refs);
      await corrected(tx, refs, voiding(refs));
      const after = await tx.execute(
        sql`select to_jsonb(m) as row from materials m where id = ${refs.materialId}`,
      );
      expect(after.rows).toEqual(before.rows);
    });
  });
});

describe("approvals of material corrections", () => {
  it("has exactly one subject (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const event = started(refs);
      await tx.insert(workSessionEvents).values(event);
      await tx.insert(materialCorrections).values(amend(refs));
      const [row] = await tx.select().from(materialCorrections);
      expect(
        await failing(tx, (sp) =>
          sp
            .insert(approvals)
            .values({ companyId: refs.companyId, reasons: ["corrected"] }),
        ),
      ).toBe("23514");
      expect(
        await failing(tx, (sp) =>
          sp.insert(approvals).values({
            companyId: refs.companyId,
            eventId: event.id,
            materialCorrectionId: row!.id,
            reasons: ["corrected"],
          }),
        ),
      ).toBe("23514");
    });
  });

  it("requires `corrected`, NULL-safely, and no NULL reason (23514)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const row = amend(refs);
      await tx.insert(materialCorrections).values(row);
      const attempt = (reasons: string) =>
        failing(tx, (sp) =>
          sp.execute(sql`insert into approvals (company_id, material_correction_id, reasons)
            values (${refs.companyId}, ${row.id}, ${reasons}::approval_reason[])`),
        );
      expect(await attempt("{offline}")).toBe("23514");
      expect(await attempt("{NULL}")).toBe("23514");
      expect(await attempt("{NULL,offline}")).toBe("23514");
      expect(await attempt("{corrected,NULL}")).toBe("23514");
      await tx.transaction((sp) =>
        sp.execute(sql`insert into approvals (company_id, material_correction_id, reasons)
          values (${refs.companyId}, ${row.id}, '{corrected,offline}')`),
      );
    });
  });

  it("accepts `{corrected}`", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      await corrected(tx, refs);
      await immediate(tx);
    });
  });

  it("leaves an event approval's reasons as they were: `{NULL}` still accepted", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const event = started(refs);
      await tx.insert(workSessionEvents).values(event);
      await tx.execute(sql`insert into approvals (company_id, event_id, reasons)
        values (${refs.companyId}, ${event.id}, '{NULL}')`);
    });
  });

  // In another company the decider guard's lookup finds no correction and refuses first
  // (23000); the composite foreign key behind it would answer 23503.
  it("allows one approval per correction (23505), in the correction's company (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const theirs = await covered(tx, { ...company, name: "Other Co" });
      const { correctionId } = await corrected(tx, refs);
      const second = {
        materialCorrectionId: correctionId,
        reasons: ["corrected" as const],
      };
      expect(
        await failing(tx, (sp) =>
          sp.insert(approvals).values({ companyId: refs.companyId, ...second }),
        ),
      ).toBe("23505");
      expect(
        await failing(tx, (sp) =>
          sp.insert(approvals).values({ companyId: theirs.companyId, ...second }),
        ),
      ).toBe("23000");
    });
  });

  it("is written pending (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const row = amend(refs);
      await tx.insert(materialCorrections).values(row);
      const error = await pgError(
        tx.transaction((sp) =>
          sp.insert(approvals).values({
            companyId: refs.companyId,
            materialCorrectionId: row.id,
            reasons: ["corrected"],
            decision: "approved",
            decidedAt: new Date(),
            decidedByUserId: refs.adminId,
          }),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("written pending");
    });
  });

  it("is never decided by the correction's submitter (23000); another user may", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const { approvalId } = await corrected(tx, refs);
      const decide = (sp: Tx, by: string) =>
        sp
          .update(approvals)
          .set({ decision: "approved", decidedAt: new Date(), decidedByUserId: by })
          .where(eq(approvals.id, approvalId));
      const error = await pgError(tx.transaction((sp) => decide(sp, refs.workerId)));
      expect(error.code).toBe("23000");
      expect(error.message).toContain("nobody decides their own correction");
      await decide(tx, refs.adminId);
      expect(one(await tx.select().from(approvals)).decision).toBe("approved");
    });
  });

  it("refuses an approval whose correction it cannot see, before the foreign key (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const theirs = await covered(tx, { ...company, name: "Other Co" });
      const row = amend(theirs);
      await tx.insert(materialCorrections).values(row);
      await asApp(tx, refs.companyId);
      const error = await pgError(
        tx.transaction((sp) =>
          sp.insert(approvals).values({
            companyId: refs.companyId,
            materialCorrectionId: row.id,
            reasons: ["corrected"],
          }),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("not visible");
    });
  });

  it("fixes the subject and reasons of a pending row (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const { approvalId } = await corrected(tx, refs);
      const { correctionId: other } = await corrected(tx, refs, voiding(refs));
      const where = eq(approvals.id, approvalId);
      for (const change of [
        { reasons: ["corrected", "offline"] as ("corrected" | "offline")[] },
        { materialCorrectionId: other },
      ]) {
        const error = await pgError(
          tx.transaction((sp) => sp.update(approvals).set(change).where(where)),
        );
        expect(error.code).toBe("23000");
        expect(error.message).toContain("only the decision of an approval changes");
      }
    });
  });

  it("fixes an event approval's reasons too (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await covered(tx);
      const event = started(refs);
      await tx.insert(workSessionEvents).values(event);
      const row = one(
        await tx
          .insert(approvals)
          .values({ companyId: refs.companyId, eventId: event.id, reasons: ["offline"] })
          .returning({ id: approvals.id }),
      );
      expect(
        await failing(tx, (sp) =>
          sp
            .update(approvals)
            .set({ reasons: ["location"] })
            .where(eq(approvals.id, row.id)),
        ),
      ).toBe("23000");
    });
  });
});
