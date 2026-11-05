// Stage 3 lines 4 and 5: closeout.submit through the application's router. Every call runs
// inside an owner transaction that is always rolled back (helpers.ts, "Rolled-back calls"):
// closeouts and labor events can never be deleted. The concurrency tests commit only deletable
// fixtures and hold each closeout open on its own connection, then roll it back.
import {
  companies,
  crews,
  dayCloseouts,
  dayCloseoutWorkers,
  jobs,
  materials,
  users,
} from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { lockCompanyFieldWrites, loadWorkerTimeline } from "../src/labor/timeline";
import {
  appCallerIn,
  asTenant,
  becomeApp,
  boundIn,
  committedCrewDay,
  crewDayIn,
  eventIn,
  materialIn,
  ownerDb,
  holding,
  lockTimeout,
  rejection,
  rolledBack,
  sqlstateOf,
  uuidv7,
  waitForLockWait,
  workedDay,
  type CrewDay,
} from "./helpers";

const owner = ownerDb();
const other = ownerDb();
const third = ownerDb();
afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
  await third.$client.end();
});

type Tx = Parameters<Parameters<typeof rolledBack>[1]>[0];

const D = "2026-10-05";

const input = (d: CrewDay, o: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  jobId: d.J,
  workDate: D,
  jobStatus: "complete" as const,
  note: "Walls done",
  clientTimestamp: new Date("2026-10-05T21:00:00.000Z"),
  // Well-formed and never current: replaced by `submit`, kept by `submitAsIs`.
  reviewFingerprint: UNREVIEWED,
  ...o,
});

const UNREVIEWED = `v1.${"0".repeat(64)}`;

const review = (tx: Tx, who: unknown, values: Record<string, unknown>) =>
  appCallerIn(tx, who).closeout.review({
    jobId: values.jobId as string,
    workDate: values.workDate as string,
  });

// Exactly what the caller sends.
const submitAsIs = (tx: Tx, who: unknown, values: Record<string, unknown>) =>
  appCallerIn(tx, who).closeout.submit(values as never);

// What the field app does: review the day as the caller, then submit with that fingerprint.
// A caller the review refuses (401, 403) submits what it was given, so the submit answers
// for itself (and a retry of the caller's own submission still gets through).
async function submit(tx: Tx, who: unknown, values: Record<string, unknown>) {
  let reviewFingerprint = values.reviewFingerprint;
  try {
    reviewFingerprint = (await review(tx, who, values)).fingerprint;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "FORBIDDEN" && code !== "UNAUTHORIZED") throw error;
  }
  return submitAsIs(tx, who, { ...values, reviewFingerprint });
}

// Back to the owner, to look past RLS, and to trader_app under the tenant again after.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

const forbidden = { code: "FORBIDDEN", message: "Not permitted." };

describe("closeout.submit — who may submit", () => {
  it("answers 401 without an identity, and to a deactivated foreman", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const off = await boundIn(tx, d.companyId, "foreman", { deactivated: true });
      await becomeApp(tx);
      await expect(submit(tx, null, input(d))).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(submit(tx, off.who, input(d))).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  it("answers 403 to a worker and to an admin", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const worker = await boundIn(tx, d.companyId, "worker");
      const admin = await boundIn(tx, d.companyId, "admin");
      await becomeApp(tx);
      await expect(submit(tx, worker.who, input(d))).rejects.toMatchObject(forbidden);
      await expect(submit(tx, admin.who, input(d))).rejects.toMatchObject(forbidden);
    });
  });

  it("answers the same 403 for another crew's job, another tenant's, an unstaffed one, or none", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const elsewhere = await crewDayIn(tx);
      const rival = await boundIn(tx, d.companyId, "foreman");
      const [rivalCrew] = await tx
        .insert(crews)
        .values({ companyId: d.companyId, name: "Rival", foremanUserId: rival.id })
        .returning({ id: crews.id });
      const [rivalJob] = await tx
        .insert(jobs)
        .values({
          companyId: d.companyId,
          customerId: d.customerId,
          name: "Rival's",
          crewId: rivalCrew!.id,
        })
        .returning({ id: jobs.id });
      await becomeApp(tx);
      for (const jobId of [rivalJob!.id, elsewhere.J, d.K, uuidv7()]) {
        await expect(submit(tx, d.who, input(d, { jobId }))).rejects.toMatchObject(
          forbidden,
        );
      }
    });
  });

  it("answers 403 when the job's crew is deactivated", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await tx
        .update(crews)
        .set({ deactivatedAt: new Date() })
        .where(eq(crews.id, d.crewId));
      await becomeApp(tx);
      await expect(submit(tx, d.who, input(d))).rejects.toMatchObject(forbidden);
    });
  });

  it("answers 403 once the foreman is demoted, before any submission of theirs", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await tx.update(users).set({ role: "worker" }).where(eq(users.id, d.foremanId));
      await becomeApp(tx);
      await expect(submit(tx, d.who, input(d))).rejects.toMatchObject(forbidden);
    });
  });
});

describe("closeout.submit — input", () => {
  it("refuses unknown keys, a non-v7 id, an archived status, a bad date, an oversized note", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      for (const bad of [
        { companyId: d.companyId },
        { submittedByUserId: d.w1 },
        { id: crypto.randomUUID() },
        { jobStatus: "archived" },
        { workDate: "2026-02-30" },
        { workDate: "2026-10-05T00:00:00Z" },
        { note: "x".repeat(2001) },
        { note: "   " },
        { reviewFingerprint: undefined },
        { reviewFingerprint: "v1.abc" },
        { reviewFingerprint: `v1.${"A".repeat(64)}` },
        { reviewFingerprint: `v0.${"0".repeat(64)}` },
      ]) {
        await expect(
          submitAsIs(tx, d.who, input(d, bad)),
          JSON.stringify(bad),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    });
  });
});

describe("closeout.submit — outcomes", () => {
  it("accepts an empty day: no members, the status applied, the zone stored", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      const values = input(d, { note: "  Rain day  " });
      const result = await submit(tx, d.who, values);
      expect(result).toMatchObject({
        result: "accepted",
        closeout: { id: values.id, jobStatusApplied: true },
      });
      const [row] = await tx
        .select()
        .from(dayCloseouts)
        .where(eq(dayCloseouts.id, values.id));
      expect(row).toMatchObject({
        workDate: D,
        timezone: "America/New_York",
        jobStatus: "complete",
        jobStatusApplied: true,
        note: "Rain day",
        submittedByUserId: d.foremanId,
        workerMarkCount: 0,
        materialCount: 0,
      });
      const [job] = await tx
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, d.J));
      expect(job?.status).toBe("complete");
    });
  });

  it("records each worker's mark and the day's materials, sealed", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      const m = await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      await materialIn(tx, d, d.J, "2026-10-06T15:00:00Z");
      await becomeApp(tx);
      const values = input(d);
      expect((await submit(tx, d.who, values)).result).toBe("accepted");
      const [row] = await tx
        .select()
        .from(dayCloseouts)
        .where(eq(dayCloseouts.id, values.id));
      expect(row).toMatchObject({ workerMarkCount: 2, materialCount: 1 });
      const marks = await tx
        .select()
        .from(dayCloseoutWorkers)
        .where(eq(dayCloseoutWorkers.closeoutId, values.id));
      expect(
        Object.fromEntries(marks.map((w) => [w.workerId, w.ledgerThrough.toISOString()])),
      ).toEqual({
        [d.w1]: "2026-10-05T16:00:00.000Z",
        [d.w2]: "2026-10-05T21:00:00.000Z",
      });
      const { rows } = await tx.execute<{ material_id: string }>(
        sql`select material_id from day_closeout_materials where closeout_id = ${values.id}`,
      );
      expect(rows).toEqual([{ material_id: m }]);
      // Stamped after everything it covers.
      expect(row!.serverTimestamp.getTime()).toBeGreaterThan(
        new Date("2026-10-05T21:00:00Z").getTime(),
      );
    });
  });

  it("rejects a day still open, a voided open session included, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await eventIn(tx, d, {
        worker: d.w1,
        job: d.J,
        type: "started",
        client: "2026-10-05T12:00:00Z",
      });
      const v = await eventIn(tx, d, {
        worker: d.w2,
        job: d.J,
        type: "started",
        client: "2026-10-05T13:00:00Z",
      });
      await becomeApp(tx);
      expect(await submit(tx, d.who, input(d))).toEqual({
        result: "rejected",
        code: "sessions_open",
      });
      await asOwner(tx, d, async () => {
        await eventIn(tx, d, {
          worker: d.w1,
          job: d.J,
          type: "ended",
          client: "2026-10-05T16:00:00Z",
        });
        await eventIn(tx, d, {
          worker: d.w2,
          job: d.J,
          type: "voided",
          client: "2026-10-05T14:00:00Z",
          voids: v,
        });
      });
      expect(await submit(tx, d.who, input(d))).toEqual({
        result: "rejected",
        code: "sessions_open",
      });
      expect(await tx.$count(dayCloseouts, eq(dayCloseouts.jobId, d.J))).toBe(0);
    });
  });

  it("rejects a day after today in the company's zone", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      expect(await submit(tx, d.who, input(d, { workDate: "2099-01-01" }))).toEqual({
        result: "rejected",
        code: "work_date_in_future",
      });
    });
  });

  it("never lets a late closeout for an earlier day overwrite a later day's status", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      await submit(
        tx,
        d.who,
        input(d, { workDate: "2026-10-06", jobStatus: "complete" }),
      );
      const late = await submit(tx, d.who, input(d, { workDate: D, jobStatus: "open" }));
      expect(late).toMatchObject({
        result: "accepted",
        closeout: { jobStatusApplied: false },
      });
      const [job] = await tx
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, d.J));
      expect(job?.status).toBe("complete");
    });
  });

  it("records but never applies a status to an archived job", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      await becomeApp(tx);
      const result = await submit(tx, d.who, input(d));
      expect(result).toMatchObject({
        result: "accepted",
        closeout: { jobStatusApplied: false },
      });
      const [job] = await tx
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, d.J));
      expect(job?.status).toBe("archived");
    });
  });
});

describe("closeout.submit — retries and conflicts", () => {
  it("answers a lost acknowledgement's retry as a duplicate, identically, with no second row", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      const first = await submit(tx, d.who, values);
      const again = await submit(tx, d.who, values);
      expect(first.result).toBe("accepted");
      expect(again).toEqual({ ...first, result: "duplicate" });
      expect(await tx.$count(dayCloseouts, eq(dayCloseouts.jobId, d.J))).toBe(1);
      expect(
        await tx.$count(dayCloseoutWorkers, eq(dayCloseoutWorkers.closeoutId, values.id)),
      ).toBe(2);
    });
  });

  it("answers a retry with the stored status result, not a recomputed one", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      const values = input(d);
      expect(await submit(tx, d.who, values)).toMatchObject({
        closeout: { jobStatusApplied: true },
      });
      // A later day's closeout now exists: recomputing would say false.
      await submit(tx, d.who, input(d, { workDate: "2026-10-06" }));
      expect(await submit(tx, d.who, values)).toMatchObject({
        result: "duplicate",
        closeout: { jobStatusApplied: true },
      });
    });
  });

  it("acknowledges nothing but the id, the server stamp and the status result", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      for (const result of [
        await submit(tx, d.who, values),
        await submit(tx, d.who, values),
      ]) {
        expect(Object.keys(result).sort()).toEqual(["closeout", "result"]);
        if (result.result === "rejected") throw new Error("expected an acknowledgement");
        expect(Object.keys(result.closeout).sort()).toEqual([
          "id",
          "jobStatusApplied",
          "serverTimestamp",
        ]);
      }
    });
  });

  it("calls the same id with a changed note a conflict", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      const values = input(d);
      await submit(tx, d.who, values);
      expect(await submit(tx, d.who, { ...values, note: "Changed" })).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await submit(tx, d.who, { ...values, jobStatus: "open" })).toMatchObject({
        code: "id_conflict",
      });
    });
  });

  it("answers another submission for the same job and day already_submitted, naming it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      const first = input(d);
      await submit(tx, d.who, first);
      expect(await submit(tx, d.who, input(d))).toEqual({
        result: "rejected",
        code: "already_submitted",
        conflictingId: first.id,
      });
    });
  });

  it("calls another foreman's reuse of the id a conflict in scope, and 403 out of it", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const successor = await boundIn(tx, d.companyId, "foreman");
      const outsider = await boundIn(tx, d.companyId, "foreman");
      await becomeApp(tx);
      const values = input(d);
      await submit(tx, d.who, values);
      await asOwner(tx, d, () =>
        tx
          .update(crews)
          .set({ foremanUserId: successor.id })
          .where(eq(crews.id, d.crewId)),
      );
      expect(await submit(tx, successor.who, values)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      await expect(submit(tx, outsider.who, values)).rejects.toMatchObject(forbidden);
    });
  });

  it("answers an id another tenant holds as id_conflict, revealing nothing and writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const theirs = await crewDayIn(tx);
      await becomeApp(tx);
      const held = input(theirs);
      expect((await submit(tx, theirs.who, held)).result).toBe("accepted");
      await tx.execute(sql`reset role`);
      const d = await crewDayIn(tx);
      await becomeApp(tx);
      const values = input(d, { id: held.id });
      // The shape of a visible conflict exactly: no conflictingId, nothing of theirs.
      expect(await submit(tx, d.who, values)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await submit(tx, d.who, values)).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      const written = await asOwner(tx, d, async () => ({
        closeouts: await tx
          .select()
          .from(dayCloseouts)
          .where(eq(dayCloseouts.companyId, d.companyId)),
        status: (await tx.select().from(jobs).where(eq(jobs.id, d.J)))[0]!.status,
      }));
      expect(written).toEqual({ closeouts: [], status: "open" });
      // The day stays open to a new confirmation under a new id.
      expect((await submit(tx, d.who, input(d))).result).toBe("accepted");
    });
  });

  it("still acknowledges the original submitter's retry after a reassignment or a demotion", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const successor = await boundIn(tx, d.companyId, "foreman");
      await becomeApp(tx);
      const values = input(d);
      const first = await submit(tx, d.who, values);
      await asOwner(tx, d, () =>
        tx
          .update(crews)
          .set({ foremanUserId: successor.id })
          .where(eq(crews.id, d.crewId)),
      );
      expect(await submit(tx, d.who, values)).toEqual({ ...first, result: "duplicate" });
      await asOwner(tx, d, () =>
        tx.update(users).set({ role: "worker" }).where(eq(users.id, d.foremanId)),
      );
      expect(await submit(tx, d.who, values)).toEqual({ ...first, result: "duplicate" });
    });
  });
});

describe("closeout.submit — once submitted", () => {
  it("can be neither edited nor extended by trader_app", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      await submit(tx, d.who, values);
      const edit = await rejection(
        tx.transaction((sp) => sp.execute(sql`update day_closeouts set note = 'Edited'`)),
      );
      expect(sqlstateOf(edit)).toBe("42501");
      const extra = await rejection(
        tx.transaction((sp) =>
          sp.insert(dayCloseoutWorkers).values({
            companyId: d.companyId,
            closeoutId: values.id,
            workerId: d.foremanId,
            ledgerThrough: new Date(),
          }),
        ),
      );
      expect(sqlstateOf(extra)).toBe("23000");
    });
  });
});

describe("closeout.submit — concurrency", () => {
  it("serializes two submissions for one job; the second goes through once the first ends", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    try {
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          expect((await submit(tx, d.who, input(d))).result).toBe("accepted");
        },
        () =>
          rolledBack(other, async (tx) => {
            await becomeApp(tx);
            await lockTimeout(tx);
            expect(sqlstateOf(await rejection(submitAsIs(tx, d.who, input(d))))).toBe(
              "55P03",
            );
          }),
      );
      await rolledBack(other, async (tx) => {
        await becomeApp(tx);
        expect((await submit(tx, d.who, input(d))).result).toBe("accepted");
      });
    } finally {
      await cleanup();
    }
  });

  it("holds the crew, the caller and the day's materials against change until it ends", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const material = await owner.transaction((tx) =>
      materialIn(tx, d, d.J, "2026-10-05T15:00:00Z"),
    );
    try {
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          expect((await submit(tx, d.who, input(d))).result).toBe("accepted");
        },
        async () => {
          const blocked = async (statement: ReturnType<typeof sql>) => {
            let code: string | undefined;
            await rolledBack(other, async (tx) => {
              await lockTimeout(tx);
              code = sqlstateOf(await rejection(tx.execute(statement)));
            });
            return code;
          };
          expect(
            await blocked(
              sql`update crews set deactivated_at = now() where id = ${d.crewId}`,
            ),
          ).toBe("55P03");
          expect(
            await blocked(
              sql`update users set role = 'worker' where id = ${d.foremanId}`,
            ),
          ).toBe("55P03");
          expect(
            await blocked(sql`update materials set cost_cents = 100, currency = 'USD'
              where id = ${material}`),
          ).toBe("55P03");
          expect(
            await blocked(
              sql`update companies set timezone = 'UTC' where id = ${d.companyId}`,
            ),
          ).toBe("55P03");
        },
      );
    } finally {
      await cleanup();
    }
  });

  it("waits out a labor writer in flight, and holds writers off while it runs", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    try {
      // A writer in flight for w1: shared field-write lock, then the worker's lock.
      await holding(
        owner,
        async (tx) => {
          await asTenant(tx, d.companyId);
          await loadWorkerTimeline(tx, d.w1);
        },
        () =>
          rolledBack(other, async (tx) => {
            await becomeApp(tx);
            await lockTimeout(tx);
            expect(sqlstateOf(await rejection(submitAsIs(tx, d.who, input(d))))).toBe(
              "55P03",
            );
          }),
      );
      // A closeout in flight: a writer waits for it, but an insert's foreign-key check on the
      // job it holds does not.
      await holding(
        owner,
        async (tx) => {
          await becomeApp(tx);
          expect((await submit(tx, d.who, input(d))).result).toBe("accepted");
        },
        () =>
          rolledBack(other, async (tx) => {
            await lockTimeout(tx);
            await eventIn(tx, d, {
              worker: d.w2,
              job: d.J,
              type: "started",
              client: "2026-10-05T12:00:00Z",
            });
            await asTenant(tx, d.companyId);
            expect(
              sqlstateOf(
                await rejection(tx.transaction((sp) => loadWorkerTimeline(sp, d.w2))),
              ),
            ).toBe("55P03");
          }),
      );
    } finally {
      await cleanup();
    }
  });
});

describe("closeout.submit — the review", () => {
  // The day reviewed, then changed by `change` as the owner, then submitted with the fingerprint
  // of the review: stale, and nothing written.
  async function staleAfter(change: (tx: Tx, d: CrewDay) => Promise<unknown>) {
    let answer: unknown;
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      await becomeApp(tx);
      const values = input(d);
      const { fingerprint } = await review(tx, d.who, values);
      await asOwner(tx, d, () => change(tx, d));
      answer = await submitAsIs(tx, d.who, { ...values, reviewFingerprint: fingerprint });
      const written = await asOwner(tx, d, () =>
        tx.select().from(dayCloseouts).where(eq(dayCloseouts.jobId, d.J)),
      );
      expect(written).toEqual([]);
    });
    return answer;
  }
  const stale = { result: "rejected", code: "review_stale" };

  it("accepts the day it was reviewed as", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      const { fingerprint } = await review(tx, d.who, values);
      expect(
        (await submitAsIs(tx, d.who, { ...values, reviewFingerprint: fingerprint }))
          .result,
      ).toBe("accepted");
    });
  });

  it("rejects a review that labor, a correction, a void, a material or the zone overtook", async () => {
    const lastEnd = async (tx: Tx, d: CrewDay) => {
      const [row] = await tx
        .execute<{ id: string; started: string }>(
          sql`
        select e.id, s.id as started from work_session_events e
        join work_session_events s on s.worker_id = e.worker_id and s.type = 'started'
        where e.worker_id = ${d.w1} and e.type = 'ended'
      `,
        )
        .then((r) => r.rows);
      return row!;
    };
    const changes: Record<string, (tx: Tx, d: CrewDay) => Promise<unknown>> = {
      // A finished session: an open one is answered sessions_open first.
      labor: async (tx, d) => {
        await eventIn(tx, d, {
          worker: d.foremanId,
          job: d.J,
          type: "started",
          client: "2026-10-05T19:00:00Z",
        });
        await eventIn(tx, d, {
          worker: d.foremanId,
          job: d.J,
          type: "ended",
          client: "2026-10-05T20:00:00Z",
        });
      },
      correction: async (tx, d) =>
        eventIn(tx, d, {
          worker: d.w1,
          job: d.J,
          type: "ended",
          client: "2026-10-05T16:00:00Z",
          server: "2026-10-05T23:00:00Z",
          corrects: (await lastEnd(tx, d)).id,
        }),
      void: async (tx, d) =>
        eventIn(tx, d, {
          worker: d.w1,
          job: d.J,
          type: "voided",
          client: "2026-10-05T17:00:00Z",
          voids: (await lastEnd(tx, d)).started,
        }),
      material: (tx, d) => materialIn(tx, d, d.J, "2026-10-05T18:00:00Z"),
      zone: (tx, d) =>
        tx
          .update(companies)
          .set({ timezone: "America/Chicago" })
          .where(eq(companies.id, d.companyId)),
    };
    for (const [what, change] of Object.entries(changes)) {
      expect([what, await staleAfter(change)]).toEqual([what, stale]);
    }
  });

  it("never overrides an office status change it did not see", async () => {
    for (const status of ["complete", "archived"] as const) {
      await rolledBack(owner, async (tx) => {
        const d = await crewDayIn(tx);
        await workedDay(tx, d);
        await becomeApp(tx);
        const values = input(d, { jobStatus: "open" });
        const { fingerprint } = await review(tx, d.who, values);
        // The office's change (Stage 4's path; the owner's update stands in for it).
        await asOwner(tx, d, () =>
          tx.update(jobs).set({ status }).where(eq(jobs.id, d.J)),
        );
        expect(
          await submitAsIs(tx, d.who, { ...values, reviewFingerprint: fingerprint }),
        ).toEqual(stale);
        const [job] = await asOwner(tx, d, () =>
          tx.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, d.J)),
        );
        expect(job?.status).toBe(status);
        expect(
          await asOwner(tx, d, () =>
            tx.select().from(dayCloseouts).where(eq(dayCloseouts.jobId, d.J)),
          ),
        ).toEqual([]);
      });
    }
  });

  it("answers another job's, another date's or another version's fingerprint review_stale", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      const [j2] = await tx
        .insert(jobs)
        .values({
          companyId: d.companyId,
          customerId: d.customerId,
          name: "J2",
          crewId: d.crewId,
        })
        .returning({ id: jobs.id });
      await becomeApp(tx);
      const values = input(d);
      const own = (await review(tx, d.who, values)).fingerprint;
      const otherJob = (await review(tx, d.who, { ...values, jobId: j2!.id }))
        .fingerprint;
      const otherDate = (await review(tx, d.who, { ...values, workDate: "2026-10-04" }))
        .fingerprint;
      expect(new Set([own, otherJob, otherDate]).size).toBe(3);
      for (const reviewFingerprint of [otherJob, otherDate, own.replace(/^v1/, "v2")]) {
        expect(await submitAsIs(tx, d.who, { ...values, reviewFingerprint })).toEqual(
          stale,
        );
      }
      expect(
        (await submitAsIs(tx, d.who, { ...values, reviewFingerprint: own })).result,
      ).toBe("accepted");
    });
  });

  it("accepts a review only an unrelated change followed", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      const { fingerprint } = await review(tx, d.who, values);
      // w1 on the unstaffed job K later that day: w1's mark moves, J's day does not.
      await asOwner(tx, d, async () => {
        await eventIn(tx, d, {
          worker: d.w1,
          job: d.K,
          type: "started",
          client: "2026-10-05T17:00:00Z",
        });
        await eventIn(tx, d, {
          worker: d.w1,
          job: d.K,
          type: "ended",
          client: "2026-10-05T18:00:00Z",
        });
      });
      expect(
        (await submitAsIs(tx, d.who, { ...values, reviewFingerprint: fingerprint }))
          .result,
      ).toBe("accepted");
    });
  });

  it("answers an open day sessions_open before judging the review", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      const { fingerprint } = await review(tx, d.who, values);
      await asOwner(tx, d, () =>
        eventIn(tx, d, {
          worker: d.foremanId,
          job: d.J,
          type: "started",
          client: "2026-10-05T19:00:00Z",
        }),
      );
      expect(
        await submitAsIs(tx, d.who, { ...values, reviewFingerprint: fingerprint }),
      ).toEqual({ result: "rejected", code: "sessions_open" });
    });
  });

  it("answers a retry of an accepted submission duplicate, whatever changed and whatever fingerprint", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await crewDayIn(tx);
      await workedDay(tx, d);
      await becomeApp(tx);
      const values = input(d);
      const { fingerprint } = await review(tx, d.who, values);
      const sent = { ...values, reviewFingerprint: fingerprint };
      const first = await submitAsIs(tx, d.who, sent);
      expect(first.result).toBe("accepted");
      // Labor lands on the closed day after the acknowledgement was lost.
      await asOwner(tx, d, () =>
        eventIn(tx, d, {
          worker: d.foremanId,
          job: d.J,
          type: "started",
          client: "2026-10-05T19:00:00Z",
        }),
      );
      const duplicate = { ...first, result: "duplicate" };
      expect(await submitAsIs(tx, d.who, sent)).toEqual(duplicate);
      // The fingerprint is a precondition, not part of the record: a different one on the
      // same id and business fields is still the same submission.
      expect(
        await submitAsIs(tx, d.who, {
          ...sent,
          reviewFingerprint: `v1.${"f".repeat(64)}`,
        }),
      ).toEqual(duplicate);
    });
  });
});

describe("closeout.submit — the review under concurrent writers", () => {
  // A transaction on `db` that runs `body`, then waits for `release` and commits.
  function committing(db: typeof owner, body: (tx: Tx) => Promise<void>) {
    let release: () => void = () => {};
    const released = new Promise<void>((r) => (release = r));
    let ready: () => void = () => {};
    const held = new Promise<void>((r) => (ready = r));
    const done = db.transaction(async (tx) => {
      await body(tx);
      ready();
      await released;
    });
    return { held, release, done };
  }

  const reviewOn = async (d: CrewDay) => {
    let fingerprint = "";
    await rolledBack(other, async (tx) => {
      await becomeApp(tx);
      fingerprint = (await review(tx, d.who, input(d))).fingerprint;
    });
    return fingerprint;
  };

  it("sees a material a cooperating writer commits while the closeout waits for its lock", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    try {
      const fingerprint = await reviewOn(d);
      // A material writer: the field-write lock shared, then its insert, uncommitted.
      const writer = committing(owner, async (tx) => {
        await asTenant(tx, d.companyId);
        await lockCompanyFieldWrites(tx, "shared");
        await materialIn(tx, d, d.J, "2026-10-05T15:00:00Z");
      });
      await writer.held;
      let answer: unknown;
      const closeout = rolledBack(third, async (tx) => {
        await becomeApp(tx);
        answer = await submitAsIs(tx, d.who, {
          ...input(d),
          reviewFingerprint: fingerprint,
        });
      });
      // The closeout waits for the exclusive field-write lock; then the writer commits.
      await waitForLockWait(owner, "select pg_advisory_xact_lock(%", {
        waitEvent: "advisory",
      });
      writer.release();
      await writer.done;
      await closeout;
      expect(answer).toEqual({ result: "rejected", code: "review_stale" });
    } finally {
      await cleanup();
    }
  });

  it("hashes the day's materials as locked, after an edit that committed while it waited", async () => {
    const { day: d, cleanup } = await committedCrewDay(owner);
    const m = await owner.transaction((tx) =>
      materialIn(tx, d, d.J, "2026-10-05T15:00:00Z"),
    );
    try {
      const fingerprint = await reviewOn(d);
      // An edit that takes no field-write lock: only the material's row lock stops it.
      const editor = committing(owner, async (tx) => {
        await tx
          .update(materials)
          .set({ description: "Satin, white" })
          .where(eq(materials.id, m));
      });
      await editor.held;
      let answer: unknown;
      const closeout = rolledBack(third, async (tx) => {
        await becomeApp(tx);
        answer = await submitAsIs(tx, d.who, {
          ...input(d),
          reviewFingerprint: fingerprint,
        });
      });
      // The closeout read the old row in gatherJobDay and now waits on its FOR SHARE.
      await waitForLockWait(owner, '%from "materials"%for share%');
      editor.release();
      await editor.done;
      await closeout;
      expect(answer).toEqual({ result: "rejected", code: "review_stale" });
    } finally {
      await cleanup();
    }
  });
});
