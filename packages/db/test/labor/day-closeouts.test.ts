// Stage 3 line 4: the day closeout tables, asserted against the migrated container. Rolled-back
// transactions throughout; see helpers.ts. The seal is deferred to commit, which a rolled-back
// transaction never reaches, so each test that wants it checked says SET CONSTRAINTS … IMMEDIATE.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../../src/client";
import {
  dayCloseoutMaterials,
  dayCloseouts,
  dayCloseoutWorkers,
  jobs,
  materials,
  users,
} from "../../src/schema";
import {
  asApp,
  company,
  fixture,
  lockExclusive,
  one,
  pgError,
  rolledBack,
  sqlstate,
  type Tx,
  uuidv7,
} from "../helpers";

type Refs = Awaited<ReturnType<typeof fixture>>;
type CloseoutInsert = typeof dayCloseouts.$inferInsert;

const closeout = (refs: Refs, values: Partial<CloseoutInsert> = {}): CloseoutInsert => ({
  id: uuidv7(),
  companyId: refs.companyId,
  jobId: refs.jobId,
  workDate: "2026-10-19",
  timezone: "America/New_York",
  jobStatus: "open",
  jobStatusApplied: true,
  note: null,
  submittedByUserId: refs.workerId,
  clientTimestamp: new Date(),
  serverTimestamp: new Date(),
  workerMarkCount: 0,
  materialCount: 0,
  ...values,
});

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
    loggedAt: new Date(),
    capturedOffline: false,
    clockSkewed: false,
    clockSkewMs: 0,
    enteredByOffice: false,
  });
  return id;
}

async function worker(tx: Tx, refs: Refs, n: string) {
  return one(
    await tx
      .insert(users)
      .values({ companyId: refs.companyId, email: `${n}@co.test`, name: n })
      .returning({ id: users.id }),
  ).id;
}

const mark = (refs: Refs, closeoutId: string, workerId = refs.workerId) => ({
  companyId: refs.companyId,
  closeoutId,
  workerId,
  ledgerThrough: new Date(),
});

const member = (refs: Refs, closeoutId: string, materialId: string) => ({
  companyId: refs.companyId,
  closeoutId,
  jobId: refs.jobId,
  materialId,
});

// Fires the deferred seal now, in a savepoint so a failure leaves the test running.
const seal = (tx: Tx) =>
  tx.transaction((sp) => sp.execute(sql`set constraints all immediate`));

const failing = (tx: Tx, statement: (sp: Tx) => Promise<unknown>) =>
  sqlstate(tx.transaction(statement));

let db: Db;
let other: Db;
beforeAll(() => {
  db = createDb();
  other = createDb();
});
afterAll(async () => {
  await db.$client.end();
  await other.$client.end();
});

describe("day_closeouts", () => {
  it("accepts a closeout with no members, sealed", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.insert(dayCloseouts).values(closeout(refs));
      await seal(tx);
    });
  });

  it("accepts a closeout with two worker marks and a material, sealed", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const second = await worker(tx, refs, "second");
      const materialId = await material(tx, refs);
      const c = closeout(refs, { workerMarkCount: 2, materialCount: 1 });
      await tx.insert(dayCloseouts).values(c);
      await tx
        .insert(dayCloseoutWorkers)
        .values([mark(refs, c.id), mark(refs, c.id, second)]);
      await tx.insert(dayCloseoutMaterials).values(member(refs, c.id, materialId));
      await seal(tx);
    });
  });

  it("rejects an id that is not version 7, an archived status, a blank zone", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const insert = (values: Partial<CloseoutInsert>) =>
        failing(tx, (sp) => sp.insert(dayCloseouts).values(closeout(refs, values)));
      expect(await insert({ id: crypto.randomUUID() })).toBe("23514");
      expect(await insert({ jobStatus: "archived" })).toBe("23514");
      expect(await insert({ timezone: "  " })).toBe("23514");
      expect(await insert({ workerMarkCount: -1 })).toBe("23514");
      expect(await insert({ materialCount: -1 })).toBe("23514");
    });
  });

  it("takes a note of 1 to 2000 characters, or none", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const insert = (note: string) =>
        failing(tx, (sp) => sp.insert(dayCloseouts).values(closeout(refs, { note })));
      expect(await insert(" ")).toBe("23514");
      expect(await insert("x".repeat(2001))).toBe("23514");
      await tx
        .insert(dayCloseouts)
        .values(closeout(refs, { note: "x".repeat(2000), workDate: "2026-10-20" }));
    });
  });

  it("allows one closeout per job and work date (23505)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.insert(dayCloseouts).values(closeout(refs));
      expect(
        await failing(tx, (sp) => sp.insert(dayCloseouts).values(closeout(refs))),
      ).toBe("23505");
      await tx.insert(dayCloseouts).values(closeout(refs, { workDate: "2026-10-20" }));
    });
  });

  it("keeps the job, submitter, workers and materials in the company (23503)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const stranger = await fixture(tx, { ...company, name: "Other Co" });
      const strangeMaterial = await material(tx, stranger);
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseouts).values(closeout(refs, { jobId: stranger.jobId })),
        ),
      ).toBe("23503");
      expect(
        await failing(tx, (sp) =>
          sp
            .insert(dayCloseouts)
            .values(closeout(refs, { submittedByUserId: stranger.workerId })),
        ),
      ).toBe("23503");
      const c = closeout(refs);
      await tx.insert(dayCloseouts).values(c);
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseoutWorkers).values(mark(refs, c.id, stranger.workerId)),
        ),
      ).toBe("23503");
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseoutMaterials).values(member(refs, c.id, strangeMaterial)),
        ),
      ).toBe("23503");
    });
  });

  it("refuses a material from another job (23503), or in two closeouts (23505)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const otherJob = one(
        await tx
          .insert(jobs)
          .values({
            companyId: refs.companyId,
            customerId: one(
              await tx
                .select({ customerId: jobs.customerId })
                .from(jobs)
                .where(sql`${jobs.id} = ${refs.jobId}`),
            ).customerId,
            name: "Other job",
          })
          .returning({ id: jobs.id }),
      ).id;
      const elsewhere = await material(tx, { ...refs, jobId: otherJob });
      const here = await material(tx, refs);
      const first = closeout(refs);
      const second = closeout(refs, { workDate: "2026-10-20" });
      await tx.insert(dayCloseouts).values([first, second]);
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseoutMaterials).values(member(refs, first.id, elsewhere)),
        ),
      ).toBe("23503");
      await tx.insert(dayCloseoutMaterials).values(member(refs, first.id, here));
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseoutMaterials).values(member(refs, second.id, here)),
        ),
      ).toBe("23505");
    });
  });
});

describe("the membership seal", () => {
  it("refuses a worker mark added after the seal (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const late = await worker(tx, refs, "late");
      const c = closeout(refs, { workerMarkCount: 1 });
      await tx.insert(dayCloseouts).values(c);
      await tx.insert(dayCloseoutWorkers).values(mark(refs, c.id));
      await seal(tx);
      const error = await pgError(
        tx.transaction((sp) =>
          sp.insert(dayCloseoutWorkers).values(mark(refs, c.id, late)),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("declared counts");
    });
  });

  it("refuses a material member added after the seal (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const c = closeout(refs);
      await tx.insert(dayCloseouts).values(c);
      await seal(tx);
      const materialId = await material(tx, refs);
      expect(
        await failing(tx, (sp) =>
          sp.insert(dayCloseoutMaterials).values(member(refs, c.id, materialId)),
        ),
      ).toBe("23000");
    });
  });

  it("refuses a closeout missing a declared member (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const c = closeout(refs, { workerMarkCount: 2 });
      await tx.insert(dayCloseouts).values(c);
      await tx.insert(dayCloseoutWorkers).values(mark(refs, c.id));
      expect(await sqlstate(seal(tx))).toBe("23000");
    });
  });

  it("refuses a closeout missing a declared material (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await tx.insert(dayCloseouts).values(closeout(refs, { materialCount: 1 }));
      expect(await sqlstate(seal(tx))).toBe("23000");
    });
  });

  // The other half of the seal's concurrency argument: a member can never join a closeout
  // that another transaction has not committed; the foreign key fails at once.
  it("refuses a member for a closeout another transaction has not committed (23503)", async () => {
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    let ready: (v: { refs: Refs; closeoutId: string }) => void = () => {};
    const holding = new Promise<{ refs: Refs; closeoutId: string }>((r) => (ready = r));
    const holder = rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      const c = closeout(refs);
      await tx.insert(dayCloseouts).values(c);
      ready({ refs, closeoutId: c.id });
      await released;
    });
    try {
      const { refs, closeoutId } = await holding;
      await rolledBack(other, async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2s'`);
        expect(
          await failing(tx, (sp) =>
            sp.insert(dayCloseoutWorkers).values(mark(refs, closeoutId)),
          ),
        ).toBe("23503");
      });
    } finally {
      release();
      await holder;
    }
  });
});

describe("append-only", () => {
  const TABLES = ["day_closeouts", "day_closeout_workers", "day_closeout_materials"];
  // CASCADE reaches approvals through material_corrections.
  const TRUNCATED = [...TABLES, "material_corrections", "approvals"];

  async function oneOfEach(tx: Tx) {
    const refs = await fixture(tx);
    const materialId = await material(tx, refs);
    const c = closeout(refs, { workerMarkCount: 1, materialCount: 1 });
    await tx.insert(dayCloseouts).values(c);
    await tx.insert(dayCloseoutWorkers).values(mark(refs, c.id));
    await tx.insert(dayCloseoutMaterials).values(member(refs, c.id, materialId));
    // Fires the pending seal: TRUNCATE refuses a table with pending trigger events (55006).
    await seal(tx);
    return refs;
  }

  it("refuses UPDATE and DELETE as the owner (23000)", async () => {
    await rolledBack(db, async (tx) => {
      await oneOfEach(tx);
      for (const table of TABLES) {
        const t = sql.identifier(table);
        expect(
          await failing(tx, (sp) =>
            sp.execute(sql`update ${t} set company_id = company_id`),
          ),
          table,
        ).toBe("23000");
        expect(await failing(tx, (sp) => sp.execute(sql`delete from ${t}`)), table).toBe(
          "23000",
        );
      }
    });
  });

  it("refuses TRUNCATE as the owner (23000)", async () => {
    await rolledBack(db, async (tx) => {
      await oneOfEach(tx);
      // Everything CASCADE reaches, held first: see lockExclusive.
      await lockExclusive(tx, TRUNCATED);
      for (const table of TABLES) {
        expect(
          await failing(tx, (sp) =>
            sp.execute(sql`truncate ${sql.identifier(table)} cascade`),
          ),
          table,
        ).toBe("23000");
      }
    });
  });

  it("refuses UPDATE, DELETE and TRUNCATE to trader_app by privilege (42501)", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await oneOfEach(tx);
      await asApp(tx, refs.companyId);
      for (const table of TABLES) {
        const t = sql.identifier(table);
        expect(
          await failing(tx, (sp) =>
            sp.execute(sql`update ${t} set company_id = company_id`),
          ),
          table,
        ).toBe("42501");
        expect(await failing(tx, (sp) => sp.execute(sql`delete from ${t}`)), table).toBe(
          "42501",
        );
        expect(await failing(tx, (sp) => sp.execute(sql`truncate ${t}`)), table).toBe(
          "42501",
        );
      }
    });
  });

  it("lets trader_app insert and read a sealed closeout in its tenant", async () => {
    await rolledBack(db, async (tx) => {
      const refs = await fixture(tx);
      await asApp(tx, refs.companyId);
      const c = closeout(refs);
      await tx.insert(dayCloseouts).values(c);
      await seal(tx);
      const { rows } = await tx.execute<{ id: string }>(
        sql`select id from day_closeouts`,
      );
      expect(rows).toEqual([{ id: c.id }]);
    });
  });
});

describe("the closed-out material freeze", () => {
  // A sealed closeout covering one material, and a second material it does not cover.
  async function closedOut(tx: Tx) {
    const refs = await fixture(tx);
    const covered = await material(tx, refs);
    const free = await material(tx, refs);
    const c = closeout(refs, { materialCount: 1 });
    await tx.insert(dayCloseouts).values(c);
    await tx.insert(dayCloseoutMaterials).values(member(refs, c.id, covered));
    await seal(tx);
    return { refs, covered, free };
  }

  const update = (tx: Tx, id: string, set: ReturnType<typeof sql>) =>
    failing(tx, (sp) => sp.execute(sql`update materials set ${set} where id = ${id}`));

  it("refuses every change to a covered material's facts (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, covered } = await closedOut(tx);
      const buyer = await worker(tx, refs, "buyer");
      const sets = [
        sql`quantity = 3`,
        sql`description = 'Flat, white'`,
        sql`unit = 'qt'`,
        sql`logged_at = logged_at - interval '1 day'`,
        sql`logged_by_user_id = ${buyer}`,
      ];
      for (const set of sets) expect(await update(tx, covered, set)).toBe("23000");
    });
  });

  it("names the freeze when it refuses", async () => {
    await rolledBack(db, async (tx) => {
      const { covered } = await closedOut(tx);
      const error = await pgError(
        tx.transaction((sp) =>
          sp.execute(sql`update materials set quantity = 3 where id = ${covered}`),
        ),
      );
      expect(error.code).toBe("23000");
      expect(error.message).toContain("closed-out material is frozen");
    });
  });

  it("refuses moving a covered material to another job (23000)", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, covered } = await closedOut(tx);
      const customerId = one(
        await tx
          .select({ customerId: jobs.customerId })
          .from(jobs)
          .where(sql`${jobs.id} = ${refs.jobId}`),
      ).customerId;
      const moved = one(
        await tx
          .insert(jobs)
          .values({ companyId: refs.companyId, customerId, name: "Moved" })
          .returning({ id: jobs.id }),
      ).id;
      expect(await update(tx, covered, sql`job_id = ${moved}`)).toBe("23000");
    });
  });

  it("refuses deleting a covered material: owner 23000, trader_app 42501", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, covered } = await closedOut(tx);
      expect(
        await failing(tx, (sp) =>
          sp.execute(sql`delete from materials where id = ${covered}`),
        ),
      ).toBe("23000");
      await asApp(tx, refs.companyId);
      expect(
        await failing(tx, (sp) =>
          sp.execute(sql`delete from materials where id = ${covered}`),
        ),
      ).toBe("42501");
    });
  });

  it("refuses TRUNCATE of materials while a closeout covers one (0A000)", async () => {
    await rolledBack(db, async (tx) => {
      await closedOut(tx);
      expect(await failing(tx, (sp) => sp.execute(sql`truncate materials`))).toBe(
        "0A000",
      );
    });
  });

  it("lets trader_app price a covered material, and refuses it a quantity", async () => {
    await rolledBack(db, async (tx) => {
      const { refs, covered } = await closedOut(tx);
      await asApp(tx, refs.companyId);
      const { rows } = await tx.execute<{ cost_cents: number; currency: string }>(sql`
        update materials set cost_cents = 8999, currency = 'USD' where id = ${covered}
        returning cost_cents, currency
      `);
      expect(rows).toEqual([{ cost_cents: 8999, currency: "USD" }]);
      expect(await update(tx, covered, sql`quantity = 3`)).toBe("23000");
    });
  });

  it("leaves a material no closeout covers editable", async () => {
    await rolledBack(db, async (tx) => {
      const { free } = await closedOut(tx);
      const { rows } = await tx.execute<{ quantity: string }>(
        sql`update materials set quantity = 3 where id = ${free} returning quantity`,
      );
      expect(rows).toEqual([{ quantity: "3.000" }]);
    });
  });
});
