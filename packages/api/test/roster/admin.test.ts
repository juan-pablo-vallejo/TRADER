// TASKS:45: roster.setRole, roster.deactivate, roster.reactivate — judged under one locking
// statement; the last active admin is never demoted or deactivated, two admins racing to do it
// to each other included; a deactivated account is no user and a reactivated one is itself
// again; admin only, a missing or foreign target one FORBIDDEN.
import { sql } from "drizzle-orm";
import type { Db } from "@trader/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  appCaller,
  disposableDb,
  member,
  outcome,
  userRow,
  waitForLockWait,
  world,
  type World,
} from "../helpers";

// A database of its own (helpers.ts, disposableDb): these writers leave audit_log rows, which
// are append-only and reference the company and the actor, so nothing committed here could be
// deleted again. Each test's world stays until the database is dropped.
let D: Awaited<ReturnType<typeof disposableDb>>;
let owner: Db;
let app: Db;
let w: World;

beforeAll(async () => {
  D = await disposableDb();
  owner = D.owner;
  app = D.app({ max: 4 });
}, 60_000);
beforeEach(async () => {
  w = await world(owner);
});
afterAll(async () => {
  await D.drop();
});

const roster = (who: unknown) => appCaller(app, who).roster;
const me = (who: unknown) => appCaller(app, who).me.get();

describe("roster.setRole", () => {
  it("changes a role, answers unchanged for the same one, and shows the row", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    expect(
      await roster(admin.who).setRole({ userId: worker.id, role: "foreman" }),
    ).toMatchObject({ result: "updated", user: { id: worker.id, role: "foreman" } });
    expect(await userRow(owner, worker.id)).toMatchObject({ role: "foreman" });
    expect(
      await roster(admin.who).setRole({ userId: worker.id, role: "foreman" }),
    ).toMatchObject({ result: "unchanged", user: { id: worker.id, role: "foreman" } });
  });

  it("refuses to demote the last active admin, a deactivated admin not counting", async () => {
    const admin = await member(owner, w, "a", "admin");
    await member(owner, w, "a", "admin", { deactivated: true });
    expect(await roster(admin.who).setRole({ userId: admin.id, role: "worker" })).toEqual(
      {
        result: "rejected",
        code: "last_admin",
      },
    );
    expect(await userRow(owner, admin.id)).toMatchObject({ role: "admin" });
  });

  it("demotes an admin while another remains, then refuses the last one", async () => {
    const one = await member(owner, w, "a", "admin", { label: "one" });
    const two = await member(owner, w, "a", "admin", { label: "two" });
    expect(
      await roster(one.who).setRole({ userId: two.id, role: "foreman" }),
    ).toMatchObject({
      result: "updated",
    });
    expect(await roster(one.who).setRole({ userId: one.id, role: "worker" })).toEqual({
      result: "rejected",
      code: "last_admin",
    });
    // Promotion is always allowed; the demoted admin is a foreman now, so it cannot call.
    expect(
      await outcome(roster(two.who).setRole({ userId: two.id, role: "admin" })),
    ).toBe("FORBIDDEN");
    expect(
      await roster(one.who).setRole({ userId: two.id, role: "admin" }),
    ).toMatchObject({
      result: "updated",
      user: { role: "admin" },
    });
  });
});

describe("roster.deactivate and roster.reactivate", () => {
  it("makes the account no user, then itself again with the same id and login", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    expect((await me(worker.who)).id).toBe(worker.id);
    const off = await roster(admin.who).deactivate({ userId: worker.id });
    expect(off).toMatchObject({ result: "updated", user: { id: worker.id } });
    if (off.result !== "updated") throw new Error("unreachable");
    expect(off.user.deactivatedAt).toBeInstanceOf(Date);
    expect(await outcome(me(worker.who))).toBe("UNAUTHORIZED");
    expect(await roster(admin.who).deactivate({ userId: worker.id })).toMatchObject({
      result: "unchanged",
    });
    expect(await roster(admin.who).reactivate({ userId: worker.id })).toMatchObject({
      result: "updated",
      user: { id: worker.id, deactivatedAt: null },
    });
    expect((await me(worker.who)).id).toBe(worker.id);
    expect(await roster(admin.who).reactivate({ userId: worker.id })).toMatchObject({
      result: "unchanged",
    });
  });

  it("keeps an unbound invitation an invitation across deactivation", async () => {
    const admin = await member(owner, w, "a", "admin");
    await roster(admin.who).deactivate({ userId: w.a.inviteId });
    await roster(admin.who).reactivate({ userId: w.a.inviteId });
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({
      identity_subject: null,
      deactivated_at: null,
    });
  });

  it("refuses to deactivate the last active admin, and lets one go while another stays", async () => {
    const one = await member(owner, w, "a", "admin", { label: "one" });
    expect(await roster(one.who).deactivate({ userId: one.id })).toEqual({
      result: "rejected",
      code: "last_admin",
    });
    const two = await member(owner, w, "a", "admin", { label: "two" });
    expect(await roster(one.who).deactivate({ userId: one.id })).toMatchObject({
      result: "updated",
    });
    expect(await outcome(roster(one.who).deactivate({ userId: two.id }))).toBe(
      "UNAUTHORIZED",
    );
    expect(await roster(two.who).deactivate({ userId: two.id })).toEqual({
      result: "rejected",
      code: "last_admin",
    });
  });
});

describe("two admins racing to demote each other", () => {
  // As context.test.ts's race(): the owner holds the lower-id admin row FOR UPDATE until both
  // calls are blocked in their locking statement at that row, then releases. Whichever runs
  // first demotes the other; the other re-reads itself demoted and is FORBIDDEN, or finds no
  // other admin and is `last_admin`. Either way one admin remains.
  it("leaves exactly one active admin", async () => {
    const x = await member(owner, w, "a", "admin", { label: "x" });
    const y = await member(owner, w, "a", "admin", { label: "y" });
    const lower = [x.id, y.id].sort()[0]!;
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${lower} for update`);
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const answer = (call: Promise<unknown>) =>
      call.then(
        (v) => v,
        (e: { code?: string }) => e.code ?? "THROWN",
      );
    const results = [
      answer(roster(x.who).setRole({ userId: y.id, role: "worker" })),
      answer(roster(y.who).setRole({ userId: x.id, role: "worker" })),
    ];
    await waitForLockWait(owner, "select%for no key update%", { n: 2 });
    release();
    await holder;
    const settled = await Promise.all(results);
    const updated = settled.filter(
      (r) =>
        typeof r === "object" &&
        r !== null &&
        (r as { result: string }).result === "updated",
    );
    expect(updated).toHaveLength(1);
    const loser = settled.find((r) => r !== updated[0]);
    expect([{ result: "rejected", code: "last_admin" }, "FORBIDDEN"]).toContainEqual(
      loser,
    );
    const roles = [
      (await userRow(owner, x.id))!.role,
      (await userRow(owner, y.id))!.role,
    ];
    expect(roles.filter((r) => r === "admin")).toHaveLength(1);
  });
});

describe("gates and targets", () => {
  it("is admin only and answers FORBIDDEN for a missing or foreign target", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    for (const call of [
      () => roster(worker.who).setRole({ userId: worker.id, role: "admin" }),
      () => roster(worker.who).deactivate({ userId: admin.id }),
      () => roster(worker.who).reactivate({ userId: admin.id }),
    ]) {
      expect(await outcome(call())).toBe("FORBIDDEN");
    }
    expect(await outcome(roster(null).deactivate({ userId: worker.id }))).toBe(
      "UNAUTHORIZED",
    );
    for (const userId of [w.b.boundId, crypto.randomUUID()]) {
      expect(await outcome(roster(admin.who).setRole({ userId, role: "worker" }))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(roster(admin.who).deactivate({ userId }))).toBe("FORBIDDEN");
      expect(await outcome(roster(admin.who).reactivate({ userId }))).toBe("FORBIDDEN");
    }
    expect(await userRow(owner, w.b.boundId)).toMatchObject({ deactivated_at: null });
  });
});
