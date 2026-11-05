// Stage 3 line 4: closeout.submit through the application's router. Every call runs inside an
// owner transaction that is always rolled back (helpers.ts, "Rolled-back calls"): closeouts and
// labor events can never be deleted. The concurrency tests commit only deletable fixtures and
// hold each closeout open on its own connection, then roll it back.
import { crews, dayCloseouts, dayCloseoutWorkers, jobs, users } from "@trader/db/schema";
import { DrizzleQueryError, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { loadWorkerTimeline } from "../src/labor/timeline";
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
  rolledBack,
  uuidv7,
  type CrewDay,
} from "./helpers";

const owner = ownerDb();
const other = ownerDb();
afterAll(async () => {
  await owner.$client.end();
  await other.$client.end();
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
  ...o,
});

const submit = (tx: Tx, who: unknown, values: Record<string, unknown>) =>
  appCallerIn(tx, who).closeout.submit(values as never);

// Back to the owner, to look past RLS, and to trader_app under the tenant again after.
async function asOwner<T>(tx: Tx, d: CrewDay, body: () => Promise<T>): Promise<T> {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

// A worked, ended day on J: w1 4 h, w2 8 h.
async function workedDay(tx: Tx, d: CrewDay) {
  await eventIn(tx, d, {
    worker: d.w1,
    job: d.J,
    type: "started",
    client: "2026-10-05T12:00:00Z",
  });
  await eventIn(tx, d, {
    worker: d.w1,
    job: d.J,
    type: "ended",
    client: "2026-10-05T16:00:00Z",
  });
  await eventIn(tx, d, {
    worker: d.w2,
    job: d.J,
    type: "started",
    client: "2026-10-05T13:00:00Z",
  });
  await eventIn(tx, d, {
    worker: d.w2,
    job: d.J,
    type: "ended",
    client: "2026-10-05T21:00:00Z",
  });
}

// The SQLSTATE somewhere in an error's cause chain.
function sqlstateOf(error: unknown): string | undefined {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e instanceof DrizzleQueryError) return (e.cause as { code?: string }).code;
  }
  return undefined;
}

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error("expected the call to fail");
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
      ]) {
        await expect(
          submit(tx, d.who, input(d, bad)),
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
      const edit = await failure(
        tx.transaction((sp) => sp.execute(sql`update day_closeouts set note = 'Edited'`)),
      );
      expect(sqlstateOf(edit)).toBe("42501");
      const extra = await failure(
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

// Two connections. The holder's closeout stays open until released, then rolls back.
async function holding(
  db: typeof owner,
  body: (tx: Tx) => Promise<void>,
  contender: () => Promise<void>,
) {
  let release: () => void = () => {};
  const released = new Promise<void>((r) => (release = r));
  let ready: () => void = () => {};
  const held = new Promise<void>((r) => (ready = r));
  let failed: unknown;
  const holder = rolledBack(db, async (tx) => {
    try {
      await body(tx);
    } catch (error) {
      failed = error;
    }
    ready();
    await released;
  });
  await held;
  try {
    if (failed !== undefined) throw failed;
    await contender();
  } finally {
    release();
    await holder;
  }
}

const lockTimeout = (tx: Tx) => tx.execute(sql`set local lock_timeout = '300ms'`);

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
            expect(sqlstateOf(await failure(submit(tx, d.who, input(d))))).toBe("55P03");
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
              code = sqlstateOf(await failure(tx.execute(statement)));
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
            expect(sqlstateOf(await failure(submit(tx, d.who, input(d))))).toBe("55P03");
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
                await failure(tx.transaction((sp) => loadWorkerTimeline(sp, d.w2))),
              ),
            ).toBe("55P03");
          }),
      );
    } finally {
      await cleanup();
    }
  });
});
