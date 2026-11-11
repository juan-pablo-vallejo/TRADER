// TASKS:46: crew.list, create, update, setForeman, addMember, removeMember, deactivate,
// reactivate — the foreman an active foreman-role user with a member row at creation and at a
// change; membership current-state, any active role, the foreman never removed; a crew with a
// job not yet archived never deactivated; a deactivated crew takes no foreman change or new
// member; admin only, a missing or foreign id one FORBIDDEN; a caller deactivated mid-call
// UNAUTHORIZED. The lock against a push in flight is crews/members-commit.test.ts.
import { crewMembers, crews, jobs, users } from "@trader/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "../../src/router";
import {
  appCaller,
  appDb,
  failure,
  http,
  member,
  outcome,
  ownerDb,
  waitForLockWait,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb({ max: 4 });
let w: World;

beforeEach(async () => {
  w = await world(owner);
});
afterEach(async () => {
  await w.cleanup();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const crew = (who: unknown) => appCaller(app, who).crew;

// A crew written by the owner with its foreman's member row, as the API leaves one.
async function crewIn(company: "a" | "b", foremanId: string, name = "Crew") {
  const companyId = w[company].companyId;
  const [row] = await owner
    .insert(crews)
    .values({ companyId, name, foremanUserId: foremanId })
    .returning({ id: crews.id });
  await owner
    .insert(crewMembers)
    .values({ companyId, crewId: row!.id, userId: foremanId });
  return row!.id;
}

async function jobOn(crewId: string | null, status: "open" | "complete" | "archived") {
  const [row] = await owner
    .insert(jobs)
    .values({
      companyId: w.a.companyId,
      customerId: w.a.customerId,
      name: `Job ${status}`,
      crewId,
      status,
    })
    .returning({ id: jobs.id });
  return row!.id;
}

const memberIds = async (crewId: string) =>
  (
    await owner
      .select({ userId: crewMembers.userId })
      .from(crewMembers)
      .where(eq(crewMembers.crewId, crewId))
  )
    .map((r) => r.userId)
    .sort();

describe("crew.list", () => {
  it("lists the company's crews with foreman state, members and job counts", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const demoted = await member(owner, w, "a", "foreman", { label: "demoted" });
    const worker = await member(owner, w, "a", "worker");
    const off = await member(owner, w, "a", "worker", { deactivated: true });
    const one = await crewIn("a", foreman.id, "Bravo");
    const two = await crewIn("a", demoted.id, "alpha");
    await owner.insert(crewMembers).values(
      [worker.id, off.id].map((userId) => ({
        companyId: w.a.companyId,
        crewId: one,
        userId,
      })),
    );
    await owner.update(users).set({ role: "worker" }).where(eq(users.id, demoted.id));
    await owner.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, two));
    await jobOn(one, "open");
    await jobOn(one, "complete");
    await jobOn(one, "archived");
    const foremanB = await member(owner, w, "b", "foreman");
    const other = await crewIn("b", foremanB.id);
    const rows = await crew(admin.who).list();
    expect(rows.map((r) => r.id)).toEqual([two, one]);
    expect(rows[1]).toStrictEqual({
      id: one,
      name: "Bravo",
      foreman: { id: foreman.id, name: expect.any(String), available: true },
      members: expect.any(Array),
      jobCount: 2,
      deactivatedAt: null,
    });
    expect(rows[1]!.members.map((m) => m.id).sort()).toEqual(
      [foreman.id, worker.id, off.id].sort(),
    );
    expect(rows[1]!.members.find((m) => m.id === off.id)!.deactivatedAt).toBeInstanceOf(
      Date,
    );
    expect(rows[1]!.members.find((m) => m.id === worker.id)).toMatchObject({
      role: "worker",
      deactivatedAt: null,
    });
    expect(rows[0]).toMatchObject({
      name: "alpha",
      foreman: { id: demoted.id, available: false },
      jobCount: 0,
    });
    expect(rows[0]!.deactivatedAt).toBeInstanceOf(Date);
    expect(rows.map((r) => r.id)).not.toContain(other);
  });

  it("answers 401, 403 and 200 over HTTP", async () => {
    const send = async (who: unknown) => {
      const r = await http(app, who, [{ path: "crew.list" }], { router: appRouter });
      return { status: r.status, ...failure(r.results[0]) };
    };
    expect(await send(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const foreman = await member(owner, w, "a", "foreman");
    expect(await send(foreman.who)).toMatchObject({ status: 403, code: "FORBIDDEN" });
    const admin = await member(owner, w, "a", "admin");
    expect((await send(admin.who)).status).toBe(200);
  });
});

describe("crew.create and crew.update", () => {
  it("creates a crew whose foreman is a member, and renames it", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const answer = await crew(admin.who).create({
      name: "  Crew One ",
      foremanUserId: foreman.id,
    });
    expect(answer).toMatchObject({
      result: "created",
      crew: {
        name: "Crew One",
        foreman: { id: foreman.id, available: true },
        members: [{ id: foreman.id, role: "foreman" }],
        jobCount: 0,
        deactivatedAt: null,
      },
    });
    if (answer.result !== "created") throw new Error("unreachable");
    expect(await memberIds(answer.crew.id)).toEqual([foreman.id]);
    expect(
      await crew(admin.who).update({ crewId: answer.crew.id, name: "Crew Uno" }),
    ).toMatchObject({ result: "updated", crew: { name: "Crew Uno" } });
  });

  it("refuses a foreman who is not an active foreman-role user, writing nothing", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    const off = await member(owner, w, "a", "foreman", { deactivated: true });
    const before = await owner.$count(crews, eq(crews.companyId, w.a.companyId));
    expect(await crew(admin.who).create({ name: "X", foremanUserId: worker.id })).toEqual(
      {
        result: "rejected",
        code: "not_a_foreman",
      },
    );
    expect(await crew(admin.who).create({ name: "X", foremanUserId: off.id })).toEqual({
      result: "rejected",
      code: "user_inactive",
    });
    expect(await owner.$count(crews, eq(crews.companyId, w.a.companyId))).toBe(before);
  });

  it("renames a deactivated crew too", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const id = await crewIn("a", foreman.id);
    await owner.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, id));
    expect(await crew(admin.who).update({ crewId: id, name: "Retired" })).toMatchObject({
      result: "updated",
      crew: { name: "Retired" },
    });
  });
});

describe("crew.setForeman", () => {
  it("points the crew at the new foreman, adds them, keeps the old one a member", async () => {
    const admin = await member(owner, w, "a", "admin");
    const old = await member(owner, w, "a", "foreman", { label: "old" });
    const next = await member(owner, w, "a", "foreman", { label: "next" });
    const id = await crewIn("a", old.id);
    expect(
      await crew(admin.who).setForeman({ crewId: id, userId: old.id }),
    ).toMatchObject({
      result: "unchanged",
    });
    const answer = await crew(admin.who).setForeman({ crewId: id, userId: next.id });
    expect(answer).toMatchObject({
      result: "updated",
      crew: { foreman: { id: next.id, available: true } },
    });
    expect(await memberIds(id)).toEqual([old.id, next.id].sort());
    // Again: already a member, still one row.
    await crew(admin.who).setForeman({ crewId: id, userId: old.id });
    expect(await memberIds(id)).toEqual([old.id, next.id].sort());
  });

  it("refuses an ineligible user and a deactivated crew", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const worker = await member(owner, w, "a", "worker");
    const off = await member(owner, w, "a", "foreman", { deactivated: true });
    const other = await member(owner, w, "a", "foreman", { label: "other" });
    const id = await crewIn("a", foreman.id);
    expect(await crew(admin.who).setForeman({ crewId: id, userId: worker.id })).toEqual({
      result: "rejected",
      code: "not_a_foreman",
    });
    expect(await crew(admin.who).setForeman({ crewId: id, userId: off.id })).toEqual({
      result: "rejected",
      code: "user_inactive",
    });
    await owner.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, id));
    expect(await crew(admin.who).setForeman({ crewId: id, userId: other.id })).toEqual({
      result: "rejected",
      code: "crew_inactive",
    });
    expect(await memberIds(id)).toEqual([foreman.id]);
  });
});

describe("crew.addMember and crew.removeMember", () => {
  it("adds any active user once, refuses an inactive one, and removes all but the foreman", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const worker = await member(owner, w, "a", "worker");
    const off = await member(owner, w, "a", "worker", { deactivated: true });
    const id = await crewIn("a", foreman.id);
    expect(
      await crew(admin.who).addMember({ crewId: id, userId: worker.id }),
    ).toMatchObject({
      result: "added",
    });
    expect(
      await crew(admin.who).addMember({ crewId: id, userId: worker.id }),
    ).toMatchObject({
      result: "unchanged",
    });
    // Any role: the admin themself.
    expect(
      await crew(admin.who).addMember({ crewId: id, userId: admin.id }),
    ).toMatchObject({
      result: "added",
      crew: {
        members: expect.arrayContaining([expect.objectContaining({ id: admin.id })]),
      },
    });
    expect(await crew(admin.who).addMember({ crewId: id, userId: off.id })).toEqual({
      result: "rejected",
      code: "user_inactive",
    });
    expect(await memberIds(id)).toEqual([foreman.id, worker.id, admin.id].sort());
    expect(
      await crew(admin.who).removeMember({ crewId: id, userId: foreman.id }),
    ).toEqual({
      result: "rejected",
      code: "is_foreman",
    });
    expect(
      await crew(admin.who).removeMember({ crewId: id, userId: worker.id }),
    ).toMatchObject({ result: "removed" });
    expect(
      await crew(admin.who).removeMember({ crewId: id, userId: worker.id }),
    ).toMatchObject({ result: "unchanged" });
    expect(await memberIds(id)).toEqual([foreman.id, admin.id].sort());
  });

  it("takes no member on a deactivated crew, but still removes one", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const worker = await member(owner, w, "a", "worker");
    const other = await member(owner, w, "a", "worker", { label: "other" });
    const id = await crewIn("a", foreman.id);
    await owner
      .insert(crewMembers)
      .values({ companyId: w.a.companyId, crewId: id, userId: worker.id });
    await owner.update(crews).set({ deactivatedAt: new Date() }).where(eq(crews.id, id));
    expect(await crew(admin.who).addMember({ crewId: id, userId: other.id })).toEqual({
      result: "rejected",
      code: "crew_inactive",
    });
    expect(
      await crew(admin.who).removeMember({ crewId: id, userId: worker.id }),
    ).toMatchObject({ result: "removed" });
    expect(await memberIds(id)).toEqual([foreman.id]);
  });
});

describe("crew.deactivate and crew.reactivate", () => {
  it("refuses while any job on it is not archived, then deactivates and reactivates", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const id = await crewIn("a", foreman.id);
    const open = await jobOn(id, "open");
    await jobOn(id, "archived");
    await jobOn(null, "open");
    expect(await crew(admin.who).deactivate({ crewId: id })).toEqual({
      result: "rejected",
      code: "jobs_assigned",
      jobCount: 1,
    });
    await owner.update(jobs).set({ status: "archived" }).where(eq(jobs.id, open));
    const off = await crew(admin.who).deactivate({ crewId: id });
    expect(off).toMatchObject({ result: "updated", crew: { id } });
    if (off.result !== "updated") throw new Error("unreachable");
    expect(off.crew.deactivatedAt).toBeInstanceOf(Date);
    expect(await crew(admin.who).deactivate({ crewId: id })).toMatchObject({
      result: "unchanged",
    });
    expect(await crew(admin.who).reactivate({ crewId: id })).toMatchObject({
      result: "updated",
      crew: { deactivatedAt: null },
    });
    expect(await crew(admin.who).reactivate({ crewId: id })).toMatchObject({
      result: "unchanged",
    });
    // Members survived the round trip.
    expect(await memberIds(id)).toEqual([foreman.id]);
  });
});

describe("gates and targets", () => {
  it("is admin only and answers FORBIDDEN for a missing or foreign crew or user", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const worker = await member(owner, w, "a", "worker");
    const id = await crewIn("a", foreman.id);
    const foremanB = await member(owner, w, "b", "foreman");
    const other = await crewIn("b", foremanB.id);
    for (const call of [
      () => crew(worker.who).create({ name: "X", foremanUserId: foreman.id }),
      () => crew(foreman.who).update({ crewId: id, name: "X" }),
      () => crew(worker.who).setForeman({ crewId: id, userId: foreman.id }),
      () => crew(worker.who).addMember({ crewId: id, userId: worker.id }),
      () => crew(worker.who).removeMember({ crewId: id, userId: worker.id }),
      () => crew(worker.who).deactivate({ crewId: id }),
      () => crew(worker.who).reactivate({ crewId: id }),
    ]) {
      expect(await outcome(call())).toBe("FORBIDDEN");
    }
    expect(await outcome(crew(null).deactivate({ crewId: id }))).toBe("UNAUTHORIZED");
    for (const crewId of [other, crypto.randomUUID()]) {
      expect(await outcome(crew(admin.who).update({ crewId, name: "X" }))).toBe(
        "FORBIDDEN",
      );
      expect(
        await outcome(crew(admin.who).setForeman({ crewId, userId: foreman.id })),
      ).toBe("FORBIDDEN");
      expect(
        await outcome(crew(admin.who).addMember({ crewId, userId: worker.id })),
      ).toBe("FORBIDDEN");
      expect(
        await outcome(crew(admin.who).removeMember({ crewId, userId: worker.id })),
      ).toBe("FORBIDDEN");
      expect(await outcome(crew(admin.who).deactivate({ crewId }))).toBe("FORBIDDEN");
      expect(await outcome(crew(admin.who).reactivate({ crewId }))).toBe("FORBIDDEN");
    }
    for (const userId of [w.b.boundId, foremanB.id, crypto.randomUUID()]) {
      expect(
        await outcome(crew(admin.who).create({ name: "X", foremanUserId: userId })),
      ).toBe("FORBIDDEN");
      expect(await outcome(crew(admin.who).setForeman({ crewId: id, userId }))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(crew(admin.who).addMember({ crewId: id, userId }))).toBe(
        "FORBIDDEN",
      );
    }
    expect(await memberIds(id)).toEqual([foreman.id]);
    expect(await memberIds(other)).toEqual([foremanB.id]);
  });

  it("re-reads the caller under lock: a deactivation committed while it waited refuses", async () => {
    const admin = await member(owner, w, "a", "admin");
    const foreman = await member(owner, w, "a", "foreman");
    const worker = await member(owner, w, "a", "worker");
    const id = await crewIn("a", foreman.id);
    await owner
      .insert(crewMembers)
      .values({ companyId: w.a.companyId, crewId: id, userId: worker.id });
    let result!: Promise<string>;
    await owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from crews where id = ${id} for update`);
      result = outcome(crew(admin.who).removeMember({ crewId: id, userId: worker.id }));
      await waitForLockWait(owner, '%from "crews"%for no key update%');
      await tx.execute(
        sql`update users set deactivated_at = now() where id = ${admin.id}`,
      );
    });
    expect(await result).toBe("UNAUTHORIZED");
    expect(
      await owner.$count(
        crewMembers,
        and(eq(crewMembers.crewId, id), eq(crewMembers.userId, worker.id)),
      ),
    ).toBe(1);
  });
});
