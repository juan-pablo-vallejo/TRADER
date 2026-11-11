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

describe("sync.push labor — a worker's own day", () => {
  it("accepts a day in order, stamps rising, with no approval for a clean capture", async () => {
    await rolledBack(owner, async (tx) => {
      const { d, w1 } = await dayFor(tx);
      const day = [
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "started",
          clientTimestamp: at("2026-10-05T12:00:00Z"),
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "paused",
          clientTimestamp: at("2026-10-05T14:00:00Z"),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "resumed",
          clientTimestamp: at("2026-10-05T14:30:00Z"),
          location: null,
        }),
        record({
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: at("2026-10-05T16:00:00Z"),
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
      const first = record({ workerId: d.w1, jobId: d.J });
      await push(tx, w1, first);
      expect(
        await push(
          tx,
          w1,
          record({
            workerId: d.w1,
            jobId: d.J,
            clientTimestamp: at("2026-10-05T13:00:00Z"),
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
            clientTimestamp: at("2026-10-05T13:00:00Z"),
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
      let hour = 0;
      for (const [o, reasons] of cases) {
        // A clean `ended` closes each session, so the next start is legal.
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: at(`2026-10-0${6 + hour}T12:00:00Z`),
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
            clientTimestamp: at(`2026-10-0${6 + hour}T13:00:00Z`),
          }),
        );
        hour++;
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
      expect(await reasonsOf({ location: HERE })).toEqual([]);
      expect(
        await reasonsOf({
          type: "paused",
          location: null,
          clientTimestamp: at("2026-10-05T13:00:00Z"),
        }),
      ).toEqual([]);
      expect(
        await reasonsOf({
          type: "resumed",
          location: FAR,
          clientTimestamp: at("2026-10-05T13:30:00Z"),
        }),
      ).toEqual([]);
      expect(
        await reasonsOf({
          type: "ended",
          location: FAR,
          clientTimestamp: at("2026-10-05T16:00:00Z"),
        }),
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
        const start = record({
          workerId: d.w1,
          jobId: d.J,
          clientTimestamp: at(c.start),
        });
        const end = record({
          workerId: d.w1,
          jobId: d.J,
          type: "ended",
          clientTimestamp: new Date(at(c.start).getTime() + 3_600_000),
        });
        for (const r of [start, end]) {
          expect(await push(tx, w1, r)).toMatchObject({
            result: "accepted",
            ack: { reasons: c.late ? ["after_closeout"] : [] },
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
      });
      const end = record({
        workerId: d.w1,
        jobId: d.J,
        type: "ended",
        clientTimestamp: at("2026-10-06T05:00:00Z"),
      });
      for (const r of [start, end]) {
        expect(await push(tx, w1, r)).toMatchObject({
          ack: { reasons: ["after_closeout"] },
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
        await push(tx, user, record({ workerId: admin.id, jobId: d.K })),
      ).toMatchObject({
        ack: { reasons: [] },
      });
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
      const r = record({ workerId: d.w1, jobId: d.J });
      await push(tx, w1, r);
      const variants: LaborRecord[] = [
        { ...r, schemaVersion: 2 },
        { ...r, payload: { ...r.payload, jobId: d.K } },
        { ...r, payload: { ...r.payload, type: "ended" } },
        {
          ...r,
          payload: { ...r.payload, clientTimestamp: at("2026-10-05T12:00:00.001Z") },
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
