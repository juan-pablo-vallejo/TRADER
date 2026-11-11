// Stage 3 line 6: material.correct through the application's router. Every call runs inside an
// owner transaction that is always rolled back (helpers.ts, "Rolled-back calls"): closeouts and
// corrections can never be deleted. The concurrency tests commit only deletable fixtures — the
// crew's day and its materials — and write any closeout or correction on a held connection,
// rolled back after.
import {
  approvals,
  companies,
  crews,
  dayCloseoutMaterials,
  dayCloseouts,
  materialCorrections,
  materials,
  users,
} from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { reviewFingerprint } from "../../src/closeout/fingerprint";
import {
  appCallerIn,
  asTenant,
  becomeApp,
  boundIn,
  committedCrewDay,
  crewDayIn,
  holding,
  lockTimeout,
  materialIn,
  ownerDb,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  waitForLockWait,
  type CrewDay,
} from "../helpers";

const owner = ownerDb();
const other = ownerDb();
afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
});

type Tx = Parameters<Parameters<typeof rolledBack>[1]>[0];

const D = "2026-10-05";
const ON_D = "2026-10-05T15:00:00Z";

const input = (materialId: string, o: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  materialId,
  correction: {
    kind: "amend",
    description: "Eggshell, white",
    quantity: "3",
    unit: "gal",
  },
  note: "Receipt says three",
  clientTimestamp: new Date("2026-10-06T12:00:00.000Z"),
  ...o,
});

const voidOf = (materialId: string, o: Record<string, unknown> = {}) =>
  input(materialId, { correction: { kind: "void" }, ...o });

const correct = (tx: Tx, who: unknown, values: Record<string, unknown>) =>
  appCallerIn(tx, who).material.correct(values as never);

// Back to the owner, to look past RLS or stand in for the office, then trader_app again.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

// A closeout of J on D covering `ids`, written as the owner (closeout.submit's own tests
// cover how one is made; the sealed rows are what matters here).
async function cover(tx: Tx, d: CrewDay, ids: string[], workDate = D) {
  const closeoutId = uuidv7();
  await tx.insert(dayCloseouts).values({
    id: closeoutId,
    companyId: d.companyId,
    jobId: d.J,
    workDate,
    timezone: "America/New_York",
    jobStatus: "open",
    jobStatusApplied: true,
    submittedByUserId: d.foremanId,
    clientTimestamp: new Date(),
    serverTimestamp: new Date(),
    workerMarkCount: 0,
    materialCount: ids.length,
  });
  if (ids.length > 0) {
    await tx.insert(dayCloseoutMaterials).values(
      ids.map((materialId) => ({
        companyId: d.companyId,
        closeoutId,
        jobId: d.J,
        materialId,
      })),
    );
  }
  return closeoutId;
}

// A crew's day with one material on J, covered by a closeout; an admin; the app role on.
async function coveredDay(tx: Tx) {
  const d = await crewDayIn(tx);
  const m = await materialIn(tx, d, d.J, ON_D);
  await cover(tx, d, [m]);
  const admin = await boundIn(tx, d.companyId, "admin");
  await becomeApp(tx);
  return { d, m, admin };
}

// The office's decision, as the owner (the approval queue is a later line).
async function decide(
  tx: Tx,
  d: CrewDay,
  correctionId: string,
  decision: "approved" | "rejected",
  by: string,
) {
  await asOwner(tx, d, () =>
    tx
      .update(approvals)
      .set({ decision, decidedAt: new Date(), decidedByUserId: by })
      .where(eq(approvals.materialCorrectionId, correctionId)),
  );
}

async function counts(tx: Tx, d: CrewDay) {
  return asOwner(tx, d, async () => ({
    corrections: (
      await tx
        .select()
        .from(materialCorrections)
        .where(eq(materialCorrections.companyId, d.companyId))
    ).length,
    approvals: (
      await tx.select().from(approvals).where(eq(approvals.companyId, d.companyId))
    ).length,
  }));
}

const forbidden = { code: "FORBIDDEN", message: "Not permitted." };

describe("material.correct — who may correct", () => {
  it("accepts the job's crew foreman and an admin", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const first = await correct(tx, d.who, input(m));
      expect(first.result).toBe("accepted");
      if (first.result !== "accepted") return;
      await decide(tx, d, first.correction.id, "approved", admin.id);
      const second = await correct(
        tx,
        admin.who,
        input(m, {
          correction: {
            kind: "amend",
            description: "Eggshell",
            quantity: "3",
            unit: "gal",
          },
        }),
      );
      expect(second.result).toBe("accepted");
    });
  });

  it("answers 401 without an identity, and to a deactivated admin", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const m = await materialIn(tx, d, d.J, ON_D);
      await cover(tx, d, [m]);
      const off = await boundIn(tx, d.companyId, "admin", { deactivated: true });
      await becomeApp(tx);
      for (const who of [null, off.who]) {
        await expect(correct(tx, who, input(m))).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
      }
    });
  });

  it("answers 403 to a worker", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      const worker = await asOwner(tx, d, () => boundIn(tx, d.companyId, "worker"));
      await expect(correct(tx, worker.who, input(m))).rejects.toMatchObject(forbidden);
    });
  });

  it("answers the same 403 for another crew's material, another tenant's, or none", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const elsewhere = await crewDayIn(tx);
      const rival = await boundIn(tx, d.companyId, "foreman");
      const [rivalCrew] = await tx
        .insert(crews)
        .values({ companyId: d.companyId, name: "Rival", foremanUserId: rival.id })
        .returning({ id: crews.id });
      const mine = await materialIn(tx, d, d.J, ON_D);
      await cover(tx, d, [mine]);
      const theirs = await materialIn(tx, elsewhere, elsewhere.J, ON_D);
      const unstaffed = await materialIn(tx, d, d.K, ON_D);
      void rivalCrew;
      await becomeApp(tx);
      // The rival foreman: d's own material is on J, which is not the rival's crew's job.
      await expect(correct(tx, rival.who, input(mine))).rejects.toMatchObject(forbidden);
      for (const id of [theirs, unstaffed, uuidv7()]) {
        await expect(correct(tx, d.who, input(id))).rejects.toMatchObject(forbidden);
      }
    });
  });

  it("answers 403 when the job's crew is deactivated or the caller demoted", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      await asOwner(tx, d, () =>
        tx.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, d.crewId)),
      );
      await expect(correct(tx, d.who, input(m))).rejects.toMatchObject(forbidden);
      await asOwner(tx, d, () =>
        tx.update(users).set({ role: "worker" }).where(eq(users.id, admin.id)),
      );
      await expect(correct(tx, admin.who, input(m))).rejects.toMatchObject(forbidden);
    });
  });
});

describe("material.correct — input", () => {
  it("refuses a company, job or submitter in the input, and malformed corrections", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      for (const bad of [
        input(m, { companyId: d.companyId }),
        input(m, { jobId: d.J }),
        input(m, { submittedByUserId: d.foremanId }),
        input(m, { id: crypto.randomUUID() }),
        input(m, { correction: { kind: "amend", description: "x", unit: "gal" } }),
        input(m, { correction: { kind: "void", quantity: "1" } }),
        input(m, { correction: { kind: "delete" } }),
        input(m, { note: "  " }),
        ...["0", "0.000", "-1", "1.2345", "1e3", "1234567890", " 2", "2.", ".5"].map(
          (q) =>
            input(m, {
              correction: { kind: "amend", description: "x", quantity: q, unit: "gal" },
            }),
        ),
      ]) {
        await expect(correct(tx, d.who, bad)).rejects.toMatchObject({
          code: "BAD_REQUEST",
        });
      }
      expect(await counts(tx, d)).toEqual({ corrections: 0, approvals: 0 });
    });
  });
});

describe("material.correct — outcomes", () => {
  it("records an amend with one pending approval tagged corrected, and leaves the receipt", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      const before = await asOwner(tx, d, () =>
        tx.execute(sql`select to_jsonb(m) as row from materials m where id = ${m}`),
      );
      const values = input(m, {
        correction: {
          kind: "amend",
          description: " Satin ",
          quantity: "2.5",
          unit: "qt",
        },
      });
      const answer = await correct(tx, d.who, values);
      expect(answer.result).toBe("accepted");
      await asOwner(tx, d, async () => {
        const [row] = await tx
          .select()
          .from(materialCorrections)
          .where(eq(materialCorrections.id, values.id));
        expect(row).toMatchObject({
          materialId: m,
          kind: "amend",
          description: "Satin",
          quantity: "2.500",
          unit: "qt",
          note: "Receipt says three",
          submittedByUserId: d.foremanId,
        });
        const [approval] = await tx
          .select()
          .from(approvals)
          .where(eq(approvals.materialCorrectionId, values.id));
        expect(approval).toMatchObject({
          eventId: null,
          reasons: ["corrected"],
          decision: null,
        });
        const after = await tx.execute(
          sql`select to_jsonb(m) as row from materials m where id = ${m}`,
        );
        expect(after.rows).toEqual(before.rows);
      });
    });
  });

  it("records a void", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      expect((await correct(tx, d.who, voidOf(m))).result).toBe("accepted");
    });
  });

  it("answers closeout_pending before the day's closeout, and accepts the same id after it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const m = await materialIn(tx, d, d.J, ON_D);
      await becomeApp(tx);
      const values = input(m);
      expect(await correct(tx, d.who, values)).toEqual({
        result: "rejected",
        code: "closeout_pending",
      });
      expect(await counts(tx, d)).toEqual({ corrections: 0, approvals: 0 });
      await asOwner(tx, d, () => cover(tx, d, [m]));
      expect((await correct(tx, d.who, values)).result).toBe("accepted");
      // The id is now that correction: another payload under it is a conflict.
      expect(await correct(tx, d.who, { ...values, note: "Other" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
    });
  });

  it("answers not_in_closeout for a material its day's closeout did not cover", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await coveredDay(tx);
      const late = await asOwner(tx, d, () => materialIn(tx, d, d.J, ON_D));
      expect(await correct(tx, d.who, input(late))).toEqual({
        result: "rejected",
        code: "not_in_closeout",
      });
      expect(await counts(tx, d)).toEqual({ corrections: 0, approvals: 0 });
    });
  });

  // The push writes a receipt recorded on a closed day with an `after_closeout` approval
  // (sync.push's own tests); the owner stands in for it here.
  it("accepts an amend and a void of an after-closeout receipt, never touching the closeout", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await coveredDay(tx);
      const lateReceipt = () =>
        asOwner(tx, d, async () => {
          const id = await materialIn(tx, d, d.J, ON_D);
          await tx.insert(approvals).values({
            companyId: d.companyId,
            materialId: id,
            reasons: ["after_closeout"],
          });
          return id;
        });
      const members = () =>
        asOwner(
          tx,
          d,
          async () =>
            (
              await tx.execute(sql`select to_jsonb(m) as row from day_closeout_materials m
            where company_id = ${d.companyId}`)
            ).rows,
        );
      const before = await members();
      const amended = await lateReceipt();
      expect((await correct(tx, d.who, input(amended))).result).toBe("accepted");
      const voided = await lateReceipt();
      expect((await correct(tx, d.who, voidOf(voided))).result).toBe("accepted");
      // Two corrections, each with its own pending `corrected` approval, beside the receipts'.
      expect(await counts(tx, d)).toEqual({ corrections: 2, approvals: 4 });
      expect(await members()).toEqual(before);
    });
  });

  it("answers not_in_closeout for a late receipt whose approval lacks after_closeout", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await coveredDay(tx);
      const m = await asOwner(tx, d, async () => {
        const id = await materialIn(tx, d, d.J, ON_D);
        await tx
          .insert(approvals)
          .values({ companyId: d.companyId, materialId: id, reasons: ["offline"] });
        return id;
      });
      expect(await correct(tx, d.who, input(m))).toEqual({
        result: "rejected",
        code: "not_in_closeout",
      });
    });
  });

  it("judges the material's date in the zone its day's closeout stored", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await coveredDay(tx);
      // 19:30 on the 5th in New York, where the closeout was judged; already the 6th at UTC+14.
      const late = await asOwner(tx, d, async () => {
        await tx
          .update(companies)
          .set({ timezone: "Pacific/Kiritimati" })
          .where(eq(companies.id, d.companyId));
        return materialIn(tx, d, d.J, "2026-10-05T23:30:00Z");
      });
      expect(await correct(tx, d.who, input(late))).toEqual({
        result: "rejected",
        code: "not_in_closeout",
      });
    });
  });

  it("answers correction_pending while one awaits a decision, then accepts the same id", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const first = input(m);
      expect((await correct(tx, d.who, first)).result).toBe("accepted");
      const second = voidOf(m);
      expect(await correct(tx, admin.who, second)).toEqual({
        result: "rejected",
        code: "correction_pending",
        conflictingId: first.id,
      });
      expect(await counts(tx, d)).toEqual({ corrections: 1, approvals: 1 });
      await decide(tx, d, first.id, "rejected", admin.id);
      expect((await correct(tx, admin.who, second)).result).toBe("accepted");
    });
  });

  it("answers material_voided after an approved void; a rejected void changes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const v1 = voidOf(m);
      expect((await correct(tx, d.who, v1)).result).toBe("accepted");
      await decide(tx, d, v1.id, "rejected", admin.id);
      const v2 = voidOf(m);
      expect((await correct(tx, d.who, v2)).result).toBe("accepted");
      await decide(tx, d, v2.id, "approved", admin.id);
      expect(await correct(tx, d.who, input(m))).toEqual({
        result: "rejected",
        code: "material_voided",
      });
    });
  });

  it("answers no_change against the receipt and against an approved amend", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const same = (quantity: string) =>
        input(m, {
          correction: {
            kind: "amend",
            description: "Eggshell, white",
            quantity,
            unit: "gal",
          },
        });
      for (const q of ["2", "2.0", "2.000", "02"]) {
        expect(await correct(tx, d.who, same(q))).toEqual({
          result: "rejected",
          code: "no_change",
        });
      }
      const amend = same("2.5");
      expect((await correct(tx, d.who, amend)).result).toBe("accepted");
      await decide(tx, d, amend.id, "approved", admin.id);
      expect(await correct(tx, d.who, same("2.500"))).toEqual({
        result: "rejected",
        code: "no_change",
      });
      expect((await correct(tx, d.who, same("2"))).result).toBe("accepted");
    });
  });

  it("stamps a material's corrections in rising order", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const stamps: number[] = [];
      for (const q of ["3", "4", "5"]) {
        const answer = await correct(
          tx,
          d.who,
          input(m, {
            correction: { kind: "amend", description: "x", quantity: q, unit: "gal" },
          }),
        );
        if (answer.result !== "accepted") throw new Error(answer.result);
        stamps.push(answer.correction.serverTimestamp.getTime());
        await decide(tx, d, answer.correction.id, "approved", admin.id);
      }
      expect(stamps[1]).toBeGreaterThan(stamps[0]!);
      expect(stamps[2]).toBeGreaterThan(stamps[1]!);
    });
  });
});

describe("material.correct — retries", () => {
  it("answers an identical retry duplicate, with the same acknowledgement", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      const values = input(m);
      const first = await correct(tx, d.who, values);
      const again = await correct(tx, d.who, {
        ...values,
        correction: { ...values.correction, quantity: "3.000" },
      });
      expect(first.result).toBe("accepted");
      expect(again).toEqual({ ...first, result: "duplicate" });
      expect(await counts(tx, d)).toEqual({ corrections: 1, approvals: 1 });
    });
  });

  it("answers id_conflict for any field the device sent that differs", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m } = await coveredDay(tx);
      const values = input(m);
      expect((await correct(tx, d.who, values)).result).toBe("accepted");
      const amendWith = (o: Record<string, string>) => ({
        ...values,
        correction: { ...values.correction, ...o },
      });
      const other = await asOwner(tx, d, () => materialIn(tx, d, d.J, ON_D));
      for (const changed of [
        amendWith({ description: "Satin" }),
        amendWith({ quantity: "4" }),
        amendWith({ unit: "qt" }),
        { ...values, correction: { kind: "void" } },
        { ...values, note: null },
        { ...values, clientTimestamp: new Date("2026-10-06T12:00:00.001Z") },
        { ...values, materialId: other },
      ]) {
        expect(await correct(tx, d.who, changed)).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
    });
  });

  it("answers its submitter's retry after a demotion, but another caller only in scope", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, m, admin } = await coveredDay(tx);
      const values = input(m);
      expect((await correct(tx, admin.who, values)).result).toBe("accepted");
      const rival = await asOwner(tx, d, () => boundIn(tx, d.companyId, "foreman"));
      // In scope, another submitter's id is a conflict; out of scope, the same 403 as any.
      expect(await correct(tx, d.who, values)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      await expect(correct(tx, rival.who, values)).rejects.toMatchObject(forbidden);
      await asOwner(tx, d, () =>
        tx.update(users).set({ role: "worker" }).where(eq(users.id, admin.id)),
      );
      expect((await correct(tx, admin.who, values)).result).toBe("duplicate");
    });
  });

  it("answers an id another tenant holds as id_conflict, revealing nothing and writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const theirs = await coveredDay(tx);
      const held = input(theirs.m);
      expect((await correct(tx, theirs.d.who, held)).result).toBe("accepted");
      await tx.execute(sql`reset role`);
      const { d, m, admin } = await coveredDay(tx);
      const values = input(m, { id: held.id });
      // The foreman and an admin alike, every time: the shape of a visible conflict exactly.
      for (const who of [d.who, admin.who, d.who]) {
        expect(await correct(tx, who, values)).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
      expect(await counts(tx, d)).toEqual({ corrections: 0, approvals: 0 });
      // The material stays open to a correction under a new id.
      expect((await correct(tx, d.who, input(m))).result).toBe("accepted");
    });
  });
});

describe("material.correct — the closeout stays as submitted", () => {
  it("changes neither the closeout's rows nor the closed day's review, and its retry still holds", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const m = await materialIn(tx, d, d.J, ON_D);
      const admin = await boundIn(tx, d.companyId, "admin");
      await becomeApp(tx);
      const caller = appCallerIn(tx, d.who);
      const reviewed = await caller.closeout.review({ jobId: d.J, workDate: D });
      const submission = {
        id: uuidv7(),
        jobId: d.J,
        workDate: D,
        jobStatus: "open" as const,
        note: null,
        clientTimestamp: new Date("2026-10-05T21:00:00.000Z"),
        reviewFingerprint: reviewed.fingerprint,
      };
      expect((await caller.closeout.submit(submission)).result).toBe("accepted");
      const snapshot = () =>
        asOwner(tx, d, async () => ({
          closeouts: (
            await tx.execute(sql`select to_jsonb(c) as row from day_closeouts c
              where company_id = ${d.companyId}`)
          ).rows,
          members: (
            await tx.execute(sql`select to_jsonb(m) as row from day_closeout_materials m
              where company_id = ${d.companyId}`)
          ).rows,
        }));
      const before = await snapshot();
      const fixed = input(m);
      expect((await correct(tx, d.who, fixed)).result).toBe("accepted");
      await decide(tx, d, fixed.id, "approved", admin.id);
      expect(await snapshot()).toEqual(before);
      const after = await caller.closeout.review({ jobId: d.J, workDate: D });
      expect(after.fingerprint).toBe(reviewed.fingerprint);
      expect(after.materials[0]).toMatchObject({ quantity: "2.000" });
      expect((await caller.closeout.submit(submission)).result).toBe("duplicate");
      // The freeze stands: the receipt's facts are never edited, only corrected.
      await tx.execute(sql`reset role`);
      expect(
        sqlstateOf(
          await rejection(
            tx.transaction((sp) =>
              sp.update(materials).set({ quantity: "3.000" }).where(eq(materials.id, m)),
            ),
          ),
        ),
      ).toBe("23000");
    });
  });

  it("leaves the review fingerprint's v1 golden vector alone", () => {
    // Pinned in closeout/fingerprint.test.ts; re-asserted here only that v1 is still current.
    expect(
      reviewFingerprint({
        companyId: "x",
        jobId: "y",
        workDate: D,
        timeZone: "UTC",
        jobStatus: "open",
        sessions: [],
        materials: [],
      }),
    ).toMatch(/^v1\./);
  });
});

describe("material.correct — isolation and locks", () => {
  it("requires READ COMMITTED", async () => {
    let thrown: unknown;
    await owner
      .transaction(
        async (tx) => {
          const d = await crewDayIn(tx);
          const m = await materialIn(tx, d, d.J, ON_D);
          await becomeApp(tx);
          thrown = await rejection(correct(tx, d.who, input(m)));
          throw new Error("rollback");
        },
        { isolationLevel: "repeatable read" },
      )
      .catch(() => {});
    expect((thrown as Error).message).toContain("requires a READ COMMITTED transaction");
  });

  it("holds the material's row against another correction of it", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    const admin = await owner.transaction((tx) => boundIn(tx, d.companyId, "admin"));
    try {
      let answer: unknown;
      let contender: Promise<void> = Promise.resolve();
      await holding(
        owner,
        async (tx) => {
          await cover(tx, d, [m]);
          await becomeApp(tx);
          expect((await correct(tx, d.who, input(m))).result).toBe("accepted");
        },
        async () => {
          contender = rolledBack(other, async (tx) => {
            await becomeApp(tx);
            answer = await correct(tx, admin.who, voidOf(m));
          });
          await waitForLockWait(owner, '%from "materials"%for no key update%');
        },
      );
      await contender;
      // The holder rolled back, closeout and all.
      expect(answer).toEqual({ result: "rejected", code: "closeout_pending" });
    } finally {
      await owner.delete(users).where(eq(users.id, admin.id));
      await cleanup();
    }
  });

  it("holds a cost fill on the material until it ends", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    try {
      await holding(
        owner,
        async (tx) => {
          await cover(tx, d, [m]);
          await becomeApp(tx);
          expect((await correct(tx, d.who, input(m))).result).toBe("accepted");
        },
        () =>
          rolledBack(other, async (tx) => {
            await lockTimeout(tx);
            expect(
              sqlstateOf(
                await rejection(
                  tx.execute(sql`update materials set cost_cents = 100, currency = 'USD'
                    where id = ${m}`),
                ),
              ),
            ).toBe("55P03");
          }),
      );
    } finally {
      await cleanup();
    }
  });

  // A closeout of J held open: submit holds J's row NO KEY UPDATE, then the field-write lock
  // exclusive. The same-job foreman waits on the row; an admin, who locks no job, on the
  // advisory lock.
  const closeoutHeld = (d: CrewDay) => async (tx: Tx) => {
    await becomeApp(tx);
    const caller = appCallerIn(tx, d.who);
    const { fingerprint } = await caller.closeout.review({ jobId: d.J, workDate: D });
    const answer = await caller.closeout.submit({
      id: uuidv7(),
      jobId: d.J,
      workDate: D,
      jobStatus: "open",
      note: null,
      clientTimestamp: new Date("2026-10-05T21:00:00.000Z"),
      reviewFingerprint: fingerprint,
    });
    expect(answer.result).toBe("accepted");
  };

  it("waits for a same-job closeout on the job's row (a foreman)", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    try {
      let answer: unknown;
      let contender: Promise<void> = Promise.resolve();
      await holding(owner, closeoutHeld(d), async () => {
        contender = rolledBack(other, async (tx) => {
          await becomeApp(tx);
          answer = await correct(tx, d.who, input(m));
        });
        await waitForLockWait(owner, '%from "jobs"%for share%');
      });
      await contender;
      expect(answer).toEqual({ result: "rejected", code: "closeout_pending" });
    } finally {
      await cleanup();
    }
  });

  it("waits for a closeout on the field-write lock (an admin)", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    const admin = await owner.transaction((tx) => boundIn(tx, d.companyId, "admin"));
    try {
      let answer: unknown;
      let contender: Promise<void> = Promise.resolve();
      await holding(owner, closeoutHeld(d), async () => {
        contender = rolledBack(other, async (tx) => {
          await becomeApp(tx);
          answer = await correct(tx, admin.who, input(m));
        });
        await waitForLockWait(owner, "select pg_advisory_xact_lock_shared(%", {
          waitEvent: "advisory",
        });
      });
      await contender;
      expect(answer).toEqual({ result: "rejected", code: "closeout_pending" });
    } finally {
      await owner.delete(users).where(eq(users.id, admin.id));
      await cleanup();
    }
  });

  it("holds off a same-job closeout on the job's row (a foreman's correction)", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    try {
      let answer: unknown;
      let contender: Promise<void> = Promise.resolve();
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          expect(await correct(tx, d.who, input(m))).toEqual({
            result: "rejected",
            code: "closeout_pending",
          });
        },
        async () => {
          contender = rolledBack(other, async (tx) => {
            answer = (await closeoutHeld(d)(tx), "accepted");
          });
          await waitForLockWait(owner, '%from "jobs"%for no key update%');
        },
      );
      await contender;
      expect(answer).toBe("accepted");
    } finally {
      await cleanup();
    }
  });

  it("holds off a closeout on the field-write lock (an admin's correction)", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) => materialIn(tx, d, d.J, ON_D));
    const admin = await owner.transaction((tx) => boundIn(tx, d.companyId, "admin"));
    try {
      let answer: unknown;
      let contender: Promise<void> = Promise.resolve();
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          expect(await correct(tx, admin.who, input(m))).toEqual({
            result: "rejected",
            code: "closeout_pending",
          });
        },
        async () => {
          contender = rolledBack(other, async (tx) => {
            answer = (await closeoutHeld(d)(tx), "accepted");
          });
          await waitForLockWait(owner, "select pg_advisory_xact_lock(%", {
            waitEvent: "advisory",
          });
        },
      );
      await contender;
      expect(answer).toBe("accepted");
    } finally {
      await owner.delete(users).where(eq(users.id, admin.id));
      await cleanup();
    }
  });
});
