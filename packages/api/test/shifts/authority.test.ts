// Dated shifts: a plan authorizes nothing by itself. A real
// clock-in through push (sync/labor.ts) answers exactly as it did before the plan existed,
// and the office read's flag says, case by case, what that push answers. Every test runs in
// an owner transaction that is always rolled back, each record in a savepoint of it as
// trader_app, as sync/labor.test.ts does.
import { jobAssignments, jobs, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import type { Tx } from "../../src/core/context";
import type { AppUser } from "../../src/core/resolve-user";
import { pushLaborEvent } from "../../src/sync/labor";
import { measureSkew } from "../../src/sync/flags";
import {
  appCallerIn,
  asTenant,
  boundIn,
  workDayIn,
  ownerDb,
  rolledBack,
  uuidv7,
  type WorkDay,
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
  d: WorkDay,
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
    signInPhone: null,
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

async function office(tx: Tx) {
  const day = await workDayIn(tx);
  const admin = await boundIn(tx, day.companyId, "admin");
  const list = async () => {
    await asTenant(tx, day.companyId);
    return (await appCallerIn(tx, admin.who).shift.week({ weekStart: WEEK.from })).shifts;
  };
  const plan = async (userId: string, jobId: string) => {
    await asTenant(tx, day.companyId);
    return appCallerIn(tx, admin.who).shift.create({
      userId,
      jobId,
      days: [{ id: uuidv7(), workDate: "2026-11-16" }],
      ...HOURS,
    });
  };
  return { day, list, plan };
}

describe("a plan authorizes nothing", () => {
  it("is not needed while the schedule is not enforced: a clock-in with no plan is accepted", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, list } = await office(tx);
      expect(await list()).toEqual([]);
      expect(await clockIn(tx, day, day.w1, "worker", day.J)).toBe("accepted");
      expect(await clockIn(tx, day, day.w2, "worker", day.K)).toBe("accepted");
    });
  });

  it("refuses a planned person's labor recorded by somebody else, as it did before the plan", async () => {
    await rolledBack(owner, async (tx) => {
      const { day, plan } = await office(tx);
      const planned = await boundIn(tx, day.companyId, "worker");
      await plan(planned.id, day.J);
      await asTenant(tx, day.companyId);
      const now = new Date();
      const answer = await tx.transaction((sp) =>
        pushLaborEvent(
          sp,
          {
            id: day.userId,
            companyId: day.companyId,
            role: "worker",
            name: "n",
            email: "e@co.test",
            phone: null,
            signInPhone: null,
          },
          {
            id: uuidv7(),
            schemaVersion: 1,
            payload: {
              workerId: planned.id,
              jobId: day.J,
              type: "started",
              clientTimestamp: new Date(now.getTime() - 1000),
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
    who: (d: WorkDay, extra: { admin: string }) => string;
    role: AppUser["role"];
    job: "J" | "K";
    arrange?: (tx: Tx, d: WorkDay) => Promise<unknown>;
    push: string;
    blockedBy: "job_archived" | "user_inactive" | null;
  };
  const cases: Case[] = [
    {
      name: "a worker",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      push: "accepted",
      blockedBy: null,
    },
    {
      name: "an admin",
      who: (_, x) => x.admin,
      role: "admin",
      job: "K",
      push: "accepted",
      blockedBy: null,
    },
    {
      name: "a worker, once the job is archived",
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
      name: "a worker who has been deactivated",
      who: (d) => d.w1,
      role: "worker",
      job: "J",
      arrange: (tx, d) =>
        tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, d.w1)),
      push: "UNAUTHORIZED",
      blockedBy: "user_inactive",
    },
  ];

  for (const c of cases) {
    it(`${c.name}: ${c.blockedBy ?? "may clock in"}`, async () => {
      await rolledBack(owner, async (tx) => {
        const { day, list } = await office(tx);
        // The admin who reads is not the admin who is planned.
        const planned = await boundIn(tx, day.companyId, "admin");
        const userId = c.who(day, { admin: planned.id });
        await tx.insert(jobAssignments).values({
          companyId: day.companyId,
          userId,
          jobId: day[c.job],
          workDate: "2026-11-16",
          ...HOURS,
        });
        await c.arrange?.(tx, day);
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
});
