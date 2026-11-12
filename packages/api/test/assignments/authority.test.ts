// TASKS, dated worker-job assignments (V1-D07): a plan authorizes nothing. A real clock-in
// through push (sync/labor.ts) answers exactly as it did before the plan existed — a worker
// planned on a job outside their crews is still `not_permitted` there — and the office read's
// flag says, case by case, what that push answers. Every test runs in an owner transaction
// that is always rolled back, each record in a savepoint of it as trader_app, as
// sync/labor.test.ts does.
import { crewMembers, crews, jobAssignments, jobs, users } from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { pushLaborEvent } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/reasons";
import {
  appCallerIn,
  asTenant,
  boundIn,
  crewDayIn,
  outcome,
  ownerDb,
  rolledBack,
  uuidv7,
  type CrewDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const HOURS = { expectedStart: "07:00", expectedEnd: "15:30" };
const WEEK = { from: "2026-11-16", to: "2026-11-22" };

// A clock-in now by `userId` on `jobId`, as that person's own push: the answer's result, its
// code when refused, or UNAUTHORIZED when push will not hear the caller at all.
async function clockIn(
  tx: Tx,
  d: CrewDay,
  userId: string,
  role: AppUser["role"],
  jobId: string,
) {
  await asTenant(tx, d.companyId);
  const now = new Date();
  const user: AppUser = {
    id: userId,
    companyId: d.companyId,
    role,
    name: "n",
    email: "e@co.test",
    phone: null,
  };
  try {
    const answer = await tx.transaction((sp) =>
      pushLaborEvent(
        sp,
        user,
        {
          id: uuidv7(),
          schemaVersion: 1,
          payload: {
            workerId: userId,
            jobId,
            type: "started",
            clientTimestamp: new Date(now.getTime() - 1000),
            attestationLevel: "biometric",
            location: null,
            timeSetByUser: false,
            capturedOffline: false,
          },
        },
        measureSkew(now, now),
      ),
    );
    return answer.result === "rejected" ? answer.code : answer.result;
  } catch (error) {
    return (error as { code?: string }).code ?? "THROWN";
  }
}

const asOwner = (tx: Tx) => tx.execute(sql`reset role`);

async function office(tx: Tx) {
  const day = await crewDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const list = async () => {
    await asTenant(tx, day.companyId);
    return appCallerIn(tx, admin.who).assignment.list(WEEK);
  };
  const plan = async (userId: string, jobId: string) => {
    await asTenant(tx, day.companyId);
    return appCallerIn(tx, admin.who).assignment.create({
      userId,
      jobId,
      workDates: ["2026-11-16"],
      ...HOURS,
    });
  };
  return { day, admin, list, plan };
}

describe("a plan authorizes nothing", () => {
  it("leaves a worker planned outside their crews `not_permitted` there, as before the plan", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      // K is on no crew: w1 could not clock in there before …
      expect(await clockIn(tx, day, day.w1, "worker", day.K)).toBe("not_permitted");
      expect(await plan(day.w1, day.K)).toMatchObject({ result: "created" });
      // … and cannot after, though the office planned them there.
      expect(await clockIn(tx, day, day.w1, "worker", day.K)).toBe("not_permitted");
      await asOwner(tx);
      expect(
        await tx.$count(
          crewMembers,
          and(eq(crewMembers.companyId, day.companyId), eq(crewMembers.userId, day.w1)),
        ),
      ).toBe(1);
    });
  });

  it("is not needed either: crew membership alone admits a clock-in with no plan", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, list } = await office(tx);
      expect(await list()).toEqual([]);
      expect(await clockIn(tx, day, day.w1, "worker", day.J)).toBe("accepted");
    });
  });

  it("refuses a foreman's crew labor for a planned non-member as it did before the plan", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const outsider = await boundIn(tx, day.companyId, "worker");
      await plan(outsider.id, day.J);
      await asTenant(tx, day.companyId);
      const now = new Date();
      const answer = await tx.transaction((sp) =>
        pushLaborEvent(
          sp,
          {
            id: day.foremanId,
            companyId: day.companyId,
            role: "foreman",
            name: "n",
            email: "e@co.test",
            phone: null,
          },
          {
            id: uuidv7(),
            schemaVersion: 1,
            payload: {
              workerId: outsider.id,
              jobId: day.J,
              type: "started",
              clientTimestamp: new Date(now.getTime() - 1000),
              attestationLevel: "biometric",
              location: null,
              timeSetByUser: false,
              capturedOffline: false,
            },
          },
          measureSkew(now, now),
        ),
      );
      expect(answer).toEqual({ result: "rejected", code: "not_permitted" });
    });
  });
});

describe("the office read's flag is push's answer", () => {
  // Each case plans one person on one job, then compares the flag with that person's own
  // clock-in there. `arrange` runs as the owner after the plan is made.
  type Case = {
    name: string;
    who: (d: CrewDay, extra: { admin: string; outsider: string }) => string;
    role: AppUser["role"];
    job: "J" | "K";
    arrange?: (tx: Tx, d: CrewDay) => Promise<unknown>;
    push: string;
    blockedBy: "crew" | "job_archived" | "worker_inactive" | null;
  };
  const cases: Case[] = [
    {
      name: "a member of the job's crew",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      push: "accepted",
      blockedBy: null,
    },
    {
      name: "the crew's foreman, with no member row",
      who: (d) => d.foremanId,
      role: "foreman",
      job: "J",
      arrange: (tx, d) =>
        tx.delete(crewMembers).where(eq(crewMembers.userId, d.foremanId)),
      push: "accepted",
      blockedBy: null,
    },
    {
      name: "an admin, on a job with no crew",
      who: (_, x) => x.admin,
      role: "admin",
      job: "K",
      push: "accepted",
      blockedBy: null,
    },
    {
      name: "a worker who is not on the job's crew",
      who: (_, x) => x.outsider,
      role: "worker",
      job: "J",
      push: "not_permitted",
      blockedBy: "crew",
    },
    {
      name: "a worker on a job with no crew",
      who: (d) => d.w1,
      role: "worker",
      job: "K",
      push: "not_permitted",
      blockedBy: "crew",
    },
    {
      name: "a member of a deactivated crew",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      arrange: (tx, d) =>
        tx.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, d.crewId)),
      push: "not_permitted",
      blockedBy: "crew",
    },
    {
      name: "a member, once the job is archived",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      arrange: (tx, d) =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.J)),
      push: "not_permitted",
      blockedBy: "job_archived",
    },
    {
      name: "an admin, once the job is archived",
      who: (_, x) => x.admin,
      role: "admin",
      job: "K",
      arrange: (tx, d) =>
        tx.update(jobs).set({ status: "archived" }).where(eq(jobs.id, d.K)),
      push: "not_permitted",
      blockedBy: "job_archived",
    },
    {
      name: "a member who has been deactivated",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      arrange: (tx, d) =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      push: "UNAUTHORIZED",
      blockedBy: "worker_inactive",
    },
  ];

  for (const c of cases) {
    it(`${c.name}: ${c.blockedBy ?? "may clock in"}`, async () => {
      await rolledBack(owner, async (tx) => {
        const { day, admin, list } = await office(tx);
        const outsider = await boundIn(tx, day.companyId, "worker");
        // A second admin plans and reads, so the planned admin's own state is the case's.
        const planned = await boundIn(tx, day.companyId, "admin");
        const userId = c.who(day, { admin: planned.id, outsider: outsider.id });
        await tx.insert(jobAssignments).values({
          companyId: day.companyId,
          userId,
          jobId: day[c.job],
          workDate: "2026-11-16",
          ...HOURS,
        });
        await c.arrange?.(tx, day);
        void admin;
        const [row] = await list();
        const pushed = await clockIn(tx, day, userId, c.role, day[c.job]);
        expect(pushed).toBe(c.push);
        expect(row).toMatchObject({
          mayClockIn: pushed === "accepted",
          blockedBy: c.blockedBy,
        });
      });
    });
  }

  it("follows a membership change at the next read", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, admin, list, plan } = await office(tx);
      const outsider = await boundIn(tx, day.companyId, "worker");
      await plan(outsider.id, day.J);
      const flag = async () => (await list()).map((r) => [r.mayClockIn, r.blockedBy]);
      expect(await flag()).toEqual([[false, "crew"]]);
      const crew = appCallerIn(tx, admin.who).crew;
      await crew.addMember({ crewId: day.crewId, userId: outsider.id });
      expect(await flag()).toEqual([[true, null]]);
      expect(await clockIn(tx, day, outsider.id, "worker", day.J)).toBe("accepted");
      await crew.removeMember({ crewId: day.crewId, userId: outsider.id });
      expect(await flag()).toEqual([[false, "crew"]]);
      // The plan itself never moved.
      expect(await outcome(list())).toBe("OK");
      expect(await list()).toHaveLength(1);
    });
  });
});
