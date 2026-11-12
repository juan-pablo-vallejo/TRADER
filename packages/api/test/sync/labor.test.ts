// Stage 3 line 7: one labor event from a push (sync/labor.ts), against Postgres. Every test runs
// in an owner transaction that is always rolled back (labor events can never be deleted); each
// record runs in a savepoint of it as trader_app under the day's tenant, as a record's own
// transaction would. Commit independence is not provable here: the real-commit suite
// (sync/push-commit.test.ts) proves it.
import {
  approvals,
  companies,
  crewMembers,
  crews,
  dayCloseouts,
  jobs,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { readWorkerEvents } from "../../src/labor/timeline";
import { deriveSessions } from "../../src/labor/work-date";
import { pushLaborEvent, type LaborRecord } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import {
  asTenant,
  boundIn,
  companyIn,
  crewDayIn,
  ownerDb,
  rejection,
  rolledBack,
  uuidv7,
  type CrewDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NOW = new Date();
const ONLINE = measureSkew(NOW, NOW);
const SKEWED = measureSkew(new Date(NOW.getTime() + 600_000), NOW);
// Providence; a stamp at the job, and one 5 km north of it.
const HERE = { lat: 41.824, lng: -71.4128, accuracyM: 8 };
const FAR = { lat: 41.869, lng: -71.4128, accuracyM: 8 };

const appUser = (
  d: { companyId: string },
  id: string,
  role: AppUser["role"],
): AppUser => ({
  id,
  companyId: d.companyId,
  role,
  name: "n",
  email: "e@co.test",
  phone: null,
});

type Payload = LaborRecord["payload"];

function record(
  o: Partial<Payload> & Pick<Payload, "workerId" | "jobId">,
  id = uuidv7(),
) {
  const payload: Payload = {
    type: "started",
    clientTimestamp: new Date("2026-10-05T12:00:00Z"),
    attestationLevel: "biometric",
    location: HERE,
    timeSetByUser: false,
    capturedOffline: false,
    ...o,
  };
  return { id, schemaVersion: 1, payload };
}

// One record in a savepoint, as its own transaction would run it.
const push = (tx: Tx, user: AppUser, r: LaborRecord, skew = ONLINE) =>
  tx.transaction((sp) => pushLaborEvent(sp, user, r, skew));

// Back to the owner for fixtures and reads past RLS, then the tenant again.
async function asOwner<T>(tx: Tx, d: { companyId: string }, body: () => Promise<T>) {
  await tx.execute(sql`reset role`);
  const result = await body();
  await asTenant(tx, d.companyId);
  return result;
}

const rowsOf = (tx: Tx, d: CrewDay) =>
  asOwner(tx, d, async () => ({
    events: (
      await tx
        .select()
        .from(workSessionEvents)
        .where(eq(workSessionEvents.companyId, d.companyId))
    ).length,
    approvals: (
      await tx.select().from(approvals).where(eq(approvals.companyId, d.companyId))
    ).length,
  }));

async function dayFor(tx: Tx) {
  const d = await crewDayIn(tx);
  await asTenant(tx, d.companyId);
  return {
    d,
    w1: appUser(d, d.w1, "worker"),
    foreman: appUser(d, d.foremanId, "foreman"),
  };
}

const at = (iso: string) => new Date(iso);
// Inside the receipt tolerance: a capture the server takes as made when it says (V1-D01). The
// default record's fixed October time is a backlog: pushed as captured online it is flagged
// `clock_skewed`, so a test of a clean capture times its events with this.
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

describe("sync.push labor — a worker's own day", () => {
  it("accepts a day in order, stamps rising, with no approval for a clean capture", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const day = [
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "started",
          clientTimestamp: ago(240),
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "paused",
          clientTimestamp: ago(180),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "resumed",
          clientTimestamp: ago(120),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: ago(60),
        }),
      ];
      const stamps: number[] = [];
      for (const r of day) {
        const answer = await push(tx, w1, r);
        expect(answer).toMatchObject({
          result: "accepted",
          ack: { id: r.id, clockSkewed: false, reasons: [] },
        });
        if (answer.result === "accepted")
          stamps.push(answer.ack.serverTimestamp.getTime());
      }
      expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
      expect(new Set(stamps).size).toBe(4);
      expect(await rowsOf(tx, d)).toEqual({ events: 4, approvals: 0 });
    });
  });

  it("stores the event as sent, with the server's stamp, skew and initiator", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J });
      const answer = await push(tx, w1, r, SKEWED);
      const row = await asOwner(
        tx,
        d,
        async () =>
          (
            await tx
              .select()
              .from(workSessionEvents)
              .where(eq(workSessionEvents.id, r.id))
          )[0],
      );
      expect(row).toMatchObject({
        companyId: d.companyId,
        workerId: d.w1,
        jobId: d.J,
        type: "started",
        clockSkewed: true,
        clockSkewMs: 600_000,
        attestationLevel: "biometric",
        locationLat: HERE.lat,
        locationLng: HERE.lng,
        locationAccuracyM: HERE.accuracyM,
        schemaVersion: 1,
        timeSetByUser: false,
        capturedOffline: false,
        initiatorUserId: d.w1,
        voidsEventId: null,
        correctsEventId: null,
      });
      expect(answer).toEqual({
        result: "accepted",
        ack: {
          id: r.id,
          serverTimestamp: row!.serverTimestamp,
          clockSkewed: true,
          reasons: ["clock_skewed"],
        },
      });
    });
  });

  it("passes validation's rejections through and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      expect(
        await push(tx, w1, record({ workerId: d.w1, jobId: d.J, type: "ended" })),
      ).toEqual({
        result: "rejected",
        code: "no_open_session",
      });
      const first = record({ workerId: d.w1, jobId: d.J, clientTimestamp: ago(120) });
      await push(tx, w1, first);
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: ago(60),
          }),
        ),
      ).toMatchObject({ result: "rejected", code: "session_already_open" });
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.K,
            type: "paused",
            clientTimestamp: ago(60),
          }),
        ),
      ).toMatchObject({
        result: "rejected",
        code: "job_id_mismatch",
        conflictingId: first.id,
      });
      expect(await rowsOf(tx, d)).toEqual({ events: 1, approvals: 0 });
    });
  });
});

describe("sync.push labor — approval facts", () => {
  it("writes one pending approval with every reason, offline from capture evidence alone", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const cases: [Partial<Payload>, string[]][] = [
        [{ capturedOffline: true }, ["offline"]],
        [{ timeSetByUser: true }, ["user_timed"]],
        [{ location: null }, ["location"]],
        [
          { capturedOffline: true, timeSetByUser: true, location: null },
          ["offline", "user_timed", "location"],
        ],
      ];
      let n = 0;
      for (const [o, reasons] of cases) {
        // A clean `ended` closes each session, so the next start is legal. All inside the
        // receipt tolerance, so no case gains `clock_skewed`.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: ago(240 - 40 * n),
          ...o,
        });
        const answer = await push(tx, w1, start);
        expect(answer).toMatchObject({ result: "accepted", ack: { reasons } });
        const row = await asOwner(
          tx,
          d,
          async () =>
            (await tx.select().from(approvals).where(eq(approvals.eventId, start.id)))[0],
        );
        expect(row).toMatchObject({
          reasons,
          decision: null,
          materialCorrectionId: null,
          materialId: null,
        });
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            type: "ended",
            clientTimestamp: ago(220 - 40 * n),
          }),
        );
        n++;
      }
    });
  });

  it("judges location against the job's place, never on a pause or resume", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx
          .update(jobs)
          .set({ locationLat: HERE.lat, locationLng: HERE.lng, locationRadiusM: 200 })
          .where(eq(jobs.id, d.J)),
      );
      const reasonsOf = async (o: Partial<Payload>) => {
        const answer = await push(tx, w1, record({ workerId: d.w1, jobId: d.J, ...o }));
        return answer.result === "accepted" ? answer.ack.reasons : answer;
      };
      expect(await reasonsOf({ location: HERE, clientTimestamp: ago(240) })).toEqual([]);
      expect(
        await reasonsOf({ type: "paused", location: null, clientTimestamp: ago(180) }),
      ).toEqual([]);
      expect(
        await reasonsOf({ type: "resumed", location: FAR, clientTimestamp: ago(120) }),
      ).toEqual([]);
      expect(
        await reasonsOf({ type: "ended", location: FAR, clientTimestamp: ago(60) }),
      ).toEqual(["location"]);
    });
  });
});

// A closeout of `job` on `workDate` judged in `zone`, as the owner (closeout.submit's own tests
// cover how one is made; the stored date and zone are what matter here).
async function closeout(tx: Tx, d: CrewDay, workDate: string, zone: string) {
  await asOwner(tx, d, () =>
    tx.insert(dayCloseouts).values({
      id: uuidv7(),
      companyId: d.companyId,
      jobId: d.J,
      workDate,
      timezone: zone,
      jobStatus: "open",
      jobStatusApplied: true,
      submittedByUserId: d.foremanId,
      clientTimestamp: new Date(),
      serverTimestamp: new Date(),
      workerMarkCount: 0,
      materialCount: 0,
    }),
  );
}

describe("sync.push labor — after its day's closeout, in the closeout's stored zone", () => {
  const NY = "America/New_York";
  const cases: [
    string,
    { date: string; zone: string; start: string; company: string; late: boolean },
  ][] = [
    [
      "zone changed since: the stored zone decides",
      {
        date: "2026-11-02",
        zone: NY,
        start: "2026-11-03T02:00:00Z",
        company: "UTC",
        late: true,
      },
    ],
    [
      "the converse",
      {
        date: "2026-11-03",
        zone: "UTC",
        start: "2026-11-03T02:00:00Z",
        company: NY,
        late: true,
      },
    ],
    [
      "the last second of the day, EDT",
      {
        date: "2026-10-31",
        zone: NY,
        start: "2026-11-01T03:59:59Z",
        company: NY,
        late: true,
      },
    ],
    [
      "the first second of the next day, EDT",
      {
        date: "2026-10-31",
        zone: NY,
        start: "2026-11-01T04:00:00Z",
        company: NY,
        late: false,
      },
    ],
    [
      "the evening of the fall-back day, EST",
      {
        date: "2026-11-01",
        zone: NY,
        start: "2026-11-02T04:30:00Z",
        company: NY,
        late: true,
      },
    ],
    [
      "the evening of the spring-forward day, EDT",
      {
        date: "2026-03-08",
        zone: NY,
        start: "2026-03-09T03:30:00Z",
        company: NY,
        late: true,
      },
    ],
  ];
  for (const [name, c] of cases) {
    it(`${name}: ${c.late ? "after_closeout" : "no reason"}`, async () => {
      await rolledBack(owner, async (tx) => {
        const { d, w1 } = await dayFor(tx);
        await closeout(tx, d, c.date, c.zone);
        await asOwner(tx, d, () =>
          tx
            .update(companies)
            .set({ timezone: c.company })
            .where(eq(companies.id, d.companyId)),
        );
        // A day long past is a backlog, and says so: captured offline.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: at(c.start),
          capturedOffline: true,
        });
        const end = record({
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: new Date(at(c.start).getTime() + 3_600_000),
          capturedOffline: true,
        });
        for (const r of [start, end]) {
          expect(await push(tx, w1, r)).toMatchObject({
            result: "accepted",
            ack: { reasons: c.late ? ["offline", "after_closeout"] : ["offline"] },
          });
        }
      });
    });
  }

  it("judges the session's start, so a late end after midnight takes its start's day", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await closeout(tx, d, "2026-10-05", NY);
      // Starts 23:00 on the 5th in New York, ends 01:00 on the 6th: wholly the 5th's.
      const start = record({
        workerId: d.w1,
        jobId: d.J,
        clientTimestamp: at("2026-10-06T03:00:00Z"),
        capturedOffline: true,
      });
      const end = record({
        workerId: d.w1,
        jobId: d.J,
        type: "ended",
        clientTimestamp: at("2026-10-06T05:00:00Z"),
        capturedOffline: true,
      });
      for (const r of [start, end]) {
        expect(await push(tx, w1, r)).toMatchObject({
          ack: { reasons: ["offline", "after_closeout"] },
        });
      }
    });
  });

  it("is another job's closeout's business only if it is this job's", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await dayFor(tx);
      await closeout(tx, d, "2026-10-05", NY);
      const admin = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      const user = appUser(d, admin.id, "admin");
      expect(
        await push(
          tx,
          user,
          record({ workerId: admin.id, jobId: d.K, capturedOffline: true }),
        ),
      ).toMatchObject({
        ack: { reasons: ["offline"] },
      });
    });
  });
});

describe("sync.push labor — the time an event claims, against its receipt (V1-D01)", () => {
  const HOUR = 3_600_000;
  const rowOf = (tx: Tx, d: CrewDay, id: string) =>
    asOwner(
      tx,
      d,
      async () =>
        (
          await tx.select().from(workSessionEvents).where(eq(workSessionEvents.id, id))
        )[0]!,
    );

  it("flags a backdated event that claims an online capture, pending, at the time it carries", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const claimed = new Date(Date.now() - HOUR);
      const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: claimed });
      // The device's clock is right (ONLINE): only the receipt comparison can flag it.
      const answer = await push(tx, w1, r);
      expect(answer).toMatchObject({
        result: "accepted",
        ack: { clockSkewed: true, reasons: ["clock_skewed"] },
      });
      const row = await rowOf(tx, d, r.id);
      expect(row).toMatchObject({
        clientTimestamp: claimed,
        clockSkewed: true,
        clockSkewMs: 0,
        capturedOffline: false,
        timeSetByUser: false,
      });
      // The evidence is on the row: its receipt is more than the tolerance after its time.
      expect(row.serverTimestamp.getTime() - claimed.getTime()).toBeGreaterThan(
        HOUR - 60_000,
      );
      const [approval] = await asOwner(tx, d, () =>
        tx.select().from(approvals).where(eq(approvals.eventId, r.id)),
      );
      expect(approval).toMatchObject({ reasons: ["clock_skewed"], decision: null });
      // Kept, not replaced: the session starts when the event says it did.
      const [session] = deriveSessions(await readWorkerEvents(tx, d.w1), "UTC");
      expect(session!.startedAt).toEqual(claimed);
    });
  });

  it("does not flag an old event that says it was captured offline or timed by the user", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const cases: [Partial<Payload>, string[]][] = [
        [{ capturedOffline: true }, ["offline"]],
        [{ timeSetByUser: true }, ["user_timed"]],
      ];
      let n = 0;
      for (const [o, reasons] of cases) {
        // Two days old, then a day old: delivery delay alone decides nothing.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: new Date(Date.now() - (48 - 24 * n) * HOUR),
          ...o,
        });
        expect(await push(tx, w1, start)).toMatchObject({
          result: "accepted",
          ack: { clockSkewed: false, reasons },
        });
        expect((await rowOf(tx, d, start.id)).clockSkewed).toBe(false);
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            type: "ended",
            clientTimestamp: new Date(Date.now() - (47 - 24 * n) * HOUR),
            capturedOffline: true,
          }),
        );
        n++;
      }
    });
  });

  it("refuses a future event whatever it says of itself, writing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const future = new Date(Date.now() + HOUR);
      const refused = { result: "rejected", code: "time_in_future" };
      const variants: Partial<Payload>[] = [
        {},
        { capturedOffline: true },
        { timeSetByUser: true },
        { capturedOffline: true, timeSetByUser: true },
      ];
      for (const o of variants) {
        const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: future, ...o });
        expect(await push(tx, w1, r)).toEqual(refused);
        // The same record sent again is judged again and refused again: nothing was kept.
        expect(await push(tx, w1, r)).toEqual(refused);
      }
      // A skewed device clock excuses nothing.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w1, jobId: d.J, clientTimestamp: future }),
          SKEWED,
        ),
      ).toEqual(refused);
      expect(await rowsOf(tx, d)).toEqual({ events: 0, approvals: 0 });
      // Inside the tolerance a slightly fast clock is taken as it is: accepted, unflagged.
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: new Date(Date.now() + 120_000),
          }),
        ),
      ).toMatchObject({ result: "accepted", ack: { clockSkewed: false, reasons: [] } });
    });
  });

  it("answers scope before time, and time before the timeline", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const future = new Date(Date.now() + HOUR);
      // K is not w1's crew's job: a caller out of scope learns no time verdict.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w1, jobId: d.K, clientTimestamp: future }),
        ),
      ).toEqual({ result: "rejected", code: "not_permitted" });
      // An end with no session, in the future: named as the future time it is.
      expect(
        await push(
          tx,
          w1,
          record({ workerId: d.w1, jobId: d.J, type: "ended", clientTimestamp: future }),
        ),
      ).toEqual({ result: "rejected", code: "time_in_future" });
      expect(await rowsOf(tx, d)).toEqual({ events: 0, approvals: 0 });
    });
  });

  it("answers a flagged event's retry from the stored row, never judging it again", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({
        workerId: d.w1,
        jobId: d.J,
        clientTimestamp: new Date(Date.now() - HOUR),
      });
      const first = await push(tx, w1, r);
      expect(first).toMatchObject({ ack: { reasons: ["clock_skewed"] } });
      const stored = await rowOf(tx, d, r.id);
      expect(await push(tx, w1, r, SKEWED)).toEqual({ ...first, result: "duplicate" });
      expect(await rowOf(tx, d, r.id)).toEqual(stored);
      expect(await rowsOf(tx, d)).toEqual({ events: 1, approvals: 1 });
    });
  });
});

describe("sync.push labor — who may push", () => {
  it("lets a worker start only on their crew's jobs, never archived, and end anywhere", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const notPermitted = { result: "rejected", code: "not_permitted" };
      expect(await push(tx, w1, record({ workerId: d.w1, jobId: d.K }))).toEqual(
        notPermitted,
      );
      const start = record({ workerId: d.w1, jobId: d.J });
      expect((await push(tx, w1, start)).result).toBe("accepted");
      // Removed from the crew and the job archived mid-session: the end is still accepted.
      await asOwner(tx, d, async () => {
        await tx
          .delete(crewMembers)
          .where(and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.w1)));
        await tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J));
      });
      expect(
        (
          await push(
            tx,
            w1,
            record({
              workerId: d.w1,
              jobId: d.J,
              type: "ended",
              clientTimestamp: at("2026-10-05T16:00:00Z"),
            }),
          )
        ).result,
      ).toBe("accepted");
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: at("2026-10-06T12:00:00Z"),
          }),
        ),
      ).toEqual(notPermitted);
    });
  });

  it("refuses a worker's start on an archived job of their own crew", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      );
      expect(await push(tx, w1, record({ workerId: d.w1, jobId: d.J }))).toMatchObject({
        code: "not_permitted",
      });
    });
  });

  it("lets a foreman record a current member's labor, every type, and their own as a lead", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, foreman } = await dayFor(tx);
      const types = ["started", "paused", "resumed", "ended"] as const;
      for (const [i, type] of types.entries()) {
        const r = record({
          workerId: d.w2,
          jobId: d.J,
          type,
          clientTimestamp: at(`2026-10-05T1${2 + i}:00:00Z`),
          location: HERE,
        });
        expect((await push(tx, foreman, r)).result).toBe("accepted");
      }
      // Leading counts without a member row.
      await asOwner(tx, d, () =>
        tx
          .delete(crewMembers)
          .where(
            and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.foremanId)),
          ),
      );
      expect(
        (await push(tx, foreman, record({ workerId: d.foremanId, jobId: d.J }))).result,
      ).toBe("accepted");
    });
  });

  it("refuses a foreman's labor for a non-member, a deactivated member, or after a demotion", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, foreman } = await dayFor(tx);
      const outsider = await asOwner(tx, d, () => boundIn(tx, d.companyId, "worker"));
      expect(
        await push(tx, foreman, record({ workerId: outsider.id, jobId: d.J })),
      ).toMatchObject({ code: "not_permitted" });
      await asOwner(tx, d, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      );
      expect(
        await push(tx, foreman, record({ workerId: d.w1, jobId: d.J })),
      ).toMatchObject({ code: "not_permitted" });
      // The role is read under the lock, not from the resolved user the call was given.
      await asOwner(tx, d, () =>
        tx.update(users).set({ role: "worker" }).where(eq(users.id, d.foremanId)),
      );
      expect(
        await push(tx, foreman, record({ workerId: d.w2, jobId: d.J })),
      ).toMatchObject({ code: "not_permitted" });
    });
  });

  it("refuses another crew's foreman, for this crew's member on this crew's job", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await dayFor(tx);
      const other = await asOwner(tx, d, async () => {
        const f = await boundIn(tx, d.companyId, "foreman");
        await tx
          .insert(crews)
          .values({ companyId: d.companyId, name: "Other", foremanUserId: f.id });
        return f;
      });
      expect(
        await push(
          tx,
          appUser(d, other.id, "foreman"),
          record({ workerId: d.w1, jobId: d.J }),
        ),
      ).toMatchObject({ code: "not_permitted" });
    });
  });

  it("lets an admin start on any job but record nobody else's labor", async () => {
    await rolledBack(owner, async (tx) => {
      const { d } = await dayFor(tx);
      const a = await asOwner(tx, d, () => boundIn(tx, d.companyId, "admin"));
      const admin = appUser(d, a.id, "admin");
      expect((await push(tx, admin, record({ workerId: a.id, jobId: d.K }))).result).toBe(
        "accepted",
      );
      expect(await push(tx, admin, record({ workerId: d.w1, jobId: d.J }))).toMatchObject(
        { code: "not_permitted" },
      );
    });
  });

  it("answers UNAUTHORIZED to a caller deactivated since resolution, and writes nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      await asOwner(tx, d, () =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      );
      const error = await rejection(push(tx, w1, record({ workerId: d.w1, jobId: d.J })));
      expect(error).toMatchObject({ code: "UNAUTHORIZED" });
      expect(await rowsOf(tx, d)).toEqual({ events: 0, approvals: 0 });
    });
  });

  it("sees no other tenant's job or worker", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await crewDayIn(tx);
      const { d, w1, foreman } = await dayFor(tx);
      expect(
        await push(tx, w1, record({ workerId: d.w1, jobId: other.J })),
      ).toMatchObject({ code: "not_permitted" });
      expect(
        await push(tx, foreman, record({ workerId: other.w1, jobId: d.J })),
      ).toMatchObject({ code: "not_permitted" });
    });
  });
});

describe("sync.push labor — idempotency", () => {
  it("answers an identical retry duplicate with the same acknowledgement", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J, capturedOffline: true });
      const first = await push(tx, w1, r);
      const again = await push(tx, w1, r, SKEWED);
      expect(again).toEqual({ ...first, result: "duplicate" });
      expect(await rowsOf(tx, d)).toEqual({ events: 1, approvals: 1 });
    });
  });

  it("answers its initiator's retry after they left the crew, from their own record", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J });
      const first = await push(tx, w1, r);
      await asOwner(tx, d, () =>
        tx
          .delete(crewMembers)
          .where(and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.w1))),
      );
      expect(await push(tx, w1, r)).toEqual({ ...first, result: "duplicate" });
    });
  });

  it("answers id_conflict for any device field that differs, the schema version included", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J, clientTimestamp: ago(60) });
      await push(tx, w1, r);
      const variants: LaborRecord[] = [
        { ...r, schemaVersion: 2 },
        { ...r, payload: { ...r.payload, jobId: d.K } },
        { ...r, payload: { ...r.payload, type: "ended" } },
        {
          ...r,
          payload: {
            ...r.payload,
            clientTimestamp: new Date(r.payload.clientTimestamp.getTime() + 1),
          },
        },
        { ...r, payload: { ...r.payload, attestationLevel: "none" } },
        { ...r, payload: { ...r.payload, location: null } },
        { ...r, payload: { ...r.payload, location: { ...HERE, accuracyM: null } } },
        { ...r, payload: { ...r.payload, location: { ...HERE, lat: 41.8241 } } },
        { ...r, payload: { ...r.payload, location: { ...HERE, lng: -71.4129 } } },
        { ...r, payload: { ...r.payload, timeSetByUser: true } },
        { ...r, payload: { ...r.payload, capturedOffline: true } },
      ];
      for (const v of variants) {
        expect(await push(tx, w1, v)).toEqual({
          result: "rejected",
          code: "id_conflict",
        });
      }
      expect(await rowsOf(tx, d)).toEqual({ events: 1, approvals: 0 });
    });
  });

  it("answers another initiator's id as id_conflict only in scope", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1, foreman } = await dayFor(tx);
      const r = record({ workerId: d.w1, jobId: d.J });
      expect((await push(tx, foreman, r)).result).toBe("accepted");
      expect(await push(tx, w1, r)).toEqual({ result: "rejected", code: "id_conflict" });
      expect(await push(tx, w1, { ...r, payload: { ...r.payload, jobId: d.K } })).toEqual(
        {
          result: "rejected",
          code: "not_permitted",
        },
      );
    });
  });

  it("answers an id another tenant holds as id_conflict, revealing nothing", async () => {
    await rolledBack(owner, async (tx) => {
      const other = await companyIn(tx);
      const otherJob = (
        await tx
          .insert(jobs)
          .values({ companyId: other.companyId, customerId: other.customerId, name: "X" })
          .returning({ id: jobs.id })
      )[0]!.id;
      const id = uuidv7();
      await tx.insert(workSessionEvents).values({
        id,
        companyId: other.companyId,
        workerId: other.userId,
        jobId: otherJob,
        type: "started",
        clientTimestamp: new Date(),
        serverTimestamp: new Date(),
        clockSkewed: false,
        clockSkewMs: 0,
        attestationLevel: "none",
        schemaVersion: 1,
        timeSetByUser: false,
        capturedOffline: false,
        initiatorUserId: other.userId,
      });
      const { d, w1 } = await dayFor(tx);
      expect(await push(tx, w1, record({ workerId: d.w1, jobId: d.J }, id))).toEqual({
        result: "rejected",
        code: "id_conflict",
      });
      expect(await rowsOf(tx, d)).toEqual({ events: 0, approvals: 0 });
    });
  });
});
