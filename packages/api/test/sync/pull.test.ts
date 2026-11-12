// Stage 3 line 7: sync.pull (sync/pull.ts) through the application's router, against Postgres,
// in rolled-back owner transactions as trader_app under the tenant. What it must never hold:
// another worker's labor or receipts, costs, coordinates, contact details or rates.
import {
  approvals,
  crewMembers,
  crews,
  jobs,
  materialCorrections,
  materials,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import { workDate } from "../../src/labor/work-date";
import {
  appCallerIn,
  asTenant,
  boundIn,
  crewDayIn,
  ownerDb,
  rejection,
  rolledBack,
  uuidv7,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NY = "America/New_York";
const DAY = 86_400_000;

// Noon in New York, `n` calendar days before today there (16:30 UTC is noon ± DST).
function noonDaysAgo(n: number): Date {
  const today = workDate(new Date(), NY);
  const d = new Date(`${today}T16:30:00Z`);
  return new Date(d.getTime() - n * DAY);
}

async function world(tx: Tx) {
  const d = await crewDayIn(tx);
  const w = await boundIn(tx, d.companyId, "worker");
  await tx
    .insert(crewMembers)
    .values({ companyId: d.companyId, crewId: d.crewId, userId: w.id });
  return { ...d, w };
}

// One event as the owner writes it, initiated by `by`.
async function event(
  tx: Tx,
  d: { companyId: string },
  e: { worker: string; job: string; type: "started" | "ended"; at: Date; by?: string },
) {
  const id = uuidv7(e.at.getTime());
  await tx.insert(workSessionEvents).values({
    id,
    companyId: d.companyId,
    workerId: e.worker,
    jobId: e.job,
    type: e.type,
    clientTimestamp: e.at,
    serverTimestamp: e.at,
    clockSkewed: false,
    clockSkewMs: 0,
    attestationLevel: "none",
    locationLat: 41.8,
    locationLng: -71.4,
    schemaVersion: 1,
    timeSetByUser: false,
    capturedOffline: false,
    initiatorUserId: e.by ?? e.worker,
  });
  return id;
}

async function session(
  tx: Tx,
  d: { companyId: string },
  worker: string,
  job: string,
  start: Date,
  by?: string,
) {
  const s = await event(tx, d, { worker, job, type: "started", at: start, by });
  const e = await event(tx, d, {
    worker,
    job,
    type: "ended",
    at: new Date(start.getTime() + 3_600_000),
    by,
  });
  return [s, e];
}

async function receipt(
  tx: Tx,
  d: { companyId: string },
  by: string,
  job: string,
  at: Date,
) {
  const id = uuidv7(at.getTime());
  await tx.insert(materials).values({
    id,
    companyId: d.companyId,
    jobId: job,
    loggedByUserId: by,
    description: "Primer",
    quantity: "1.000",
    unit: "gal",
    costCents: 4599,
    currency: "USD",
    loggedAt: at,
    capturedOffline: false,
    clockSkewed: false,
    clockSkewMs: 0,
    enteredByOffice: false,
  });
  return id;
}

const pull = (tx: Tx, who: unknown) =>
  appCallerIn(tx, who).sync.pull({ protocolVersion: 1 });

describe("sync.pull — who may call", () => {
  it("answers UNAUTHORIZED without an identity and to a deactivated account; refuses protocol 2", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await asTenant(tx, d.companyId);
      expect(await rejection(pull(tx, null))).toMatchObject({ code: "UNAUTHORIZED" });
      expect(
        await rejection(
          appCallerIn(tx, d.w.who).sync.pull({ protocolVersion: 2 } as never),
        ),
      ).toMatchObject({ code: "BAD_REQUEST" });
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ deactivatedAt: new Date() })
        .where(eq(users.id, d.w.id));
      await asTenant(tx, d.companyId);
      expect(await rejection(pull(tx, d.w.who))).toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});

describe("sync.pull — own labor only", () => {
  it("holds the caller's own sessions and events, whoever recorded them, and no one else's", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const other = await crewDayIn(tx);
      const mine = await session(tx, d, d.w.id, d.J, noonDaysAgo(1));
      const byForeman = await session(tx, d, d.w.id, d.J, noonDaysAgo(2), d.foremanId);
      await session(tx, d, d.w1, d.J, noonDaysAgo(1));
      await session(tx, d, d.w2, d.J, noonDaysAgo(1), d.foremanId);
      await session(tx, other, other.w1, other.J, noonDaysAgo(1));
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.w.who);
      expect(snap.events.map((e) => e.id).sort()).toEqual([...mine, ...byForeman].sort());
      expect(snap.sessions.map((s) => s.rootEventId).sort()).toEqual(
        [mine[0], byForeman[0]].sort(),
      );
      expect(snap.sessions[0]).toMatchObject({
        state: "ended",
        workedMs: 3_600_000,
        voided: false,
      });
      // The foreman recorded labor for others; none of it is the foreman's own.
      const foremanSnap = await pull(tx, d.who);
      expect(foremanSnap.events).toEqual([]);
      expect(Object.keys(snap.events[0]!).sort()).toEqual(
        [
          "approval",
          "clientTimestamp",
          "clockSkewed",
          "correctsEventId",
          "id",
          "jobId",
          "serverTimestamp",
          "type",
          "voidsEventId",
        ].sort(),
      );
    });
  });

  it("keeps the last 14 days in the company's zone, and an open session whatever its age", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const in13 = await session(tx, d, d.w.id, d.J, noonDaysAgo(13));
      await session(tx, d, d.w.id, d.J, noonDaysAgo(14));
      await session(tx, d, d.w.id, d.J, noonDaysAgo(30));
      // Another worker, clocked in 20 days ago and never out.
      const v = await boundIn(tx, d.companyId, "worker");
      await session(tx, d, v.id, d.J, noonDaysAgo(25));
      const open = await event(tx, d, {
        worker: v.id,
        job: d.J,
        type: "started",
        at: noonDaysAgo(20),
      });
      await asTenant(tx, d.companyId);
      expect((await pull(tx, d.w.who)).sessions.map((s) => s.rootEventId)).toEqual([
        in13[0],
      ]);
      const snap = await pull(tx, v.who);
      expect(snap.sessions.map((s) => s.rootEventId)).toEqual([open]);
      expect(snap.sessions[0]).toMatchObject({ state: "working", endedAt: null });
      expect(snap.events.map((e) => e.id)).toEqual([open]);
    });
  });

  it("tells each event's approval state", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const [a, b] = await session(tx, d, d.w.id, d.J, noonDaysAgo(1));
      const [c, e] = await session(tx, d, d.w.id, d.J, noonDaysAgo(2));
      for (const id of [b, c, e]) {
        await tx
          .insert(approvals)
          .values({ companyId: d.companyId, eventId: id!, reasons: ["offline"] });
      }
      const decide = (id: string, decision: "approved" | "rejected") =>
        tx
          .update(approvals)
          .set({ decision, decidedAt: new Date(), decidedByUserId: admin.id })
          .where(eq(approvals.eventId, id));
      await decide(c!, "approved");
      await decide(e!, "rejected");
      await asTenant(tx, d.companyId);
      const state = new Map(
        (await pull(tx, d.w.who)).events.map((x) => [x.id, x.approval]),
      );
      expect([a, b, c, e].map((id) => state.get(id!))).toEqual([
        "none",
        "pending",
        "approved",
        "rejected",
      ]);
    });
  });
});

describe("sync.pull — own receipts", () => {
  it("gives each receipt as logged and as in effect, never its cost", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const admin = await boundIn(tx, d.companyId, "admin");
      const at = noonDaysAgo(1);
      const amended = await receipt(tx, d, d.w.id, d.J, at);
      const voided = await receipt(tx, d, d.w.id, d.J, at);
      const pending = await receipt(tx, d, d.w.id, d.J, at);
      const refused = await receipt(tx, d, d.w.id, d.J, at);
      await receipt(tx, d, d.w1, d.J, at);
      await receipt(tx, d, d.w.id, d.J, noonDaysAgo(20));
      // Late receipts, so each is correctable (0024); their own approvals stay pending.
      for (const id of [amended, voided, pending, refused]) {
        await tx.insert(approvals).values({
          companyId: d.companyId,
          materialId: id,
          reasons: ["after_closeout"],
        });
      }
      const correct = async (
        materialId: string,
        kind: "amend" | "void",
        decision: "approved" | "rejected" | null,
      ) => {
        const id = uuidv7();
        await tx.insert(materialCorrections).values({
          id,
          companyId: d.companyId,
          materialId,
          kind,
          description: kind === "amend" ? "Primer, grey" : null,
          quantity: kind === "amend" ? "2.000" : null,
          unit: kind === "amend" ? "gal" : null,
          submittedByUserId: d.foremanId,
          clientTimestamp: new Date(),
          serverTimestamp: new Date(),
        });
        await tx.insert(approvals).values({
          companyId: d.companyId,
          materialCorrectionId: id,
          reasons: ["corrected"],
        });
        if (decision !== null) {
          await tx
            .update(approvals)
            .set({ decision, decidedAt: new Date(), decidedByUserId: admin.id })
            .where(eq(approvals.materialCorrectionId, id));
        }
      };
      await correct(amended, "amend", "approved");
      await correct(voided, "void", "approved");
      await correct(pending, "amend", null);
      await correct(refused, "amend", "rejected");
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.w.who);
      const byId = new Map(snap.materials.map((m) => [m.id, m]));
      expect([...byId.keys()].sort()).toEqual([amended, voided, pending, refused].sort());
      const original = { description: "Primer", quantity: "1.000", unit: "gal" };
      expect(byId.get(amended)).toMatchObject({
        original,
        effective: {
          description: "Primer, grey",
          quantity: "2.000",
          unit: "gal",
          voided: false,
        },
        correctionPending: false,
        approval: "pending",
      });
      expect(byId.get(voided)).toMatchObject({
        effective: { ...original, voided: true },
      });
      expect(byId.get(pending)).toMatchObject({
        effective: { ...original, voided: false },
        correctionPending: true,
      });
      expect(byId.get(refused)).toMatchObject({
        effective: { ...original, voided: false },
        correctionPending: false,
      });
      expect(Object.keys(byId.get(amended)!).sort()).toEqual(
        [
          "approval",
          "correctionPending",
          "effective",
          "id",
          "jobId",
          "loggedAt",
          "original",
        ].sort(),
      );
    });
  });
});

describe("sync.pull — reference data", () => {
  it("lists the jobs the caller may start on: crew jobs not archived, every job for an admin", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const [j3] = await tx
        .insert(jobs)
        .values({
          companyId: d.companyId,
          customerId: d.customerId,
          name: "J3",
          crewId: d.crewId,
          status: "archived",
        })
        .returning({ id: jobs.id });
      await tx
        .update(jobs)
        .set({ locationLat: 41.8, locationLng: -71.4, locationRadiusM: 200 })
        .where(eq(jobs.id, d.J));
      const admin = await boundIn(tx, d.companyId, "admin");
      // The foreman leads the crew without a member row.
      await tx
        .delete(crewMembers)
        .where(
          and(eq(crewMembers.crewId, d.crewId), eq(crewMembers.userId, d.foremanId)),
        );
      await asTenant(tx, d.companyId);
      const jobIds = async (who: unknown) =>
        (await pull(tx, who)).jobs.map((j) => j.id).sort();
      expect(await jobIds(d.w.who)).toEqual([d.J]);
      expect(await jobIds(d.who)).toEqual([d.J]);
      expect(await jobIds(admin.who)).toEqual([d.J, d.K].sort());
      expect(await jobIds(admin.who)).not.toContain(j3!.id);
      const [job] = (await pull(tx, d.w.who)).jobs;
      expect(Object.keys(job!).sort()).toEqual(["address", "id", "name", "status"]);
    });
  });

  it("counts no deactivated crew: no jobs through it, no roster", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await tx
        .update(crews)
        .set({ deactivatedAt: new Date() })
        .where(eq(crews.id, d.crewId));
      await asTenant(tx, d.companyId);
      expect((await pull(tx, d.w.who)).jobs).toEqual([]);
      expect((await pull(tx, d.who)).ledCrews).toEqual([]);
    });
  });

  it("gives a demoted foreman no roster, and still their own labor and the crew's jobs", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      const [mine] = await session(tx, d, d.foremanId, d.J, noonDaysAgo(1));
      await tx.update(users).set({ role: "worker" }).where(eq(users.id, d.foremanId));
      await asTenant(tx, d.companyId);
      const snap = await pull(tx, d.who);
      expect(snap.ledCrews).toEqual([]);
      expect(snap.me.role).toBe("worker");
      expect(snap.sessions.map((s) => s.rootEventId)).toEqual([mine]);
      expect(snap.jobs.map((j) => j.id)).toEqual([d.J]);
    });
  });

  it("gives a lead their crew's active members by id and name, and a worker no roster", async () => {
    await rolledBack(owner, async (tx) => {
      const d = await world(tx);
      await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w2));
      await asTenant(tx, d.companyId);
      const lead = await pull(tx, d.who);
      expect(lead.ledCrews).toHaveLength(1);
      expect(lead.ledCrews[0]!.members.map((m) => m.id).sort()).toEqual(
        [d.foremanId, d.w1, d.w.id].sort(),
      );
      expect(Object.keys(lead.ledCrews[0]!.members[0]!).sort()).toEqual(["id", "name"]);
      expect((await pull(tx, d.w.who)).ledCrews).toEqual([]);
      expect(lead.me).toEqual({ id: d.foremanId, role: "foreman", name: "Rolled" });
      expect(lead.company).toEqual({
        name: expect.stringMatching(/^Rolled Co /),
        timezone: NY,
      });
    });
  });
});
