// Stage 3 line 1b: identity resolution and first-sign-in binding through the protected
// procedure, against the real database as trader_app. Every failure is the same UNAUTHORIZED
// and leaves every users row exactly as it was.
import { users } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appDb,
  caller,
  identity,
  outcome,
  ownerDb,
  userCount,
  userRow,
  waitForBlockedUpdates,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb();
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

const inside = (who: unknown) => caller(app, who).probe.inside();

describe("identity resolution", () => {
  it("refuses a missing identity", async () => {
    expect(await outcome(inside(null))).toBe("UNAUTHORIZED");
  });

  it("refuses an identity whose email is not verified, or whose subject is blank", async () => {
    for (const who of [
      { subject: w.a.boundSubject, email: w.a.boundEmail, emailVerified: false },
      { subject: "  ", email: w.a.inviteEmail, emailVerified: true },
      { subject: w.a.boundSubject },
    ]) {
      expect(await outcome(inside(who))).toBe("UNAUTHORIZED");
    }
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({ identity_subject: null });
  });

  it("resolves a bound subject to its own row and tenant, writing nothing", async () => {
    const before = await userRow(owner, w.a.boundId);
    const seen = await inside(identity(w.a.boundSubject, "any@co.test"));
    expect(seen.user).toEqual({
      id: w.a.boundId,
      companyId: w.a.companyId,
      role: "worker",
      name: "Bound a",
      email: w.a.boundEmail,
      phone: null,
    });
    expect(seen.company).toBe(w.a.companyId);
    expect(await userRow(owner, w.a.boundId)).toEqual(before);
  });

  it("binds exactly one invitation, changing only identity_subject and updated_at", async () => {
    const before = await userRow(owner, w.a.inviteId);
    const seen = await inside(
      identity(`sub-new-${w.run}`, w.a.inviteEmail.toUpperCase()),
    );
    expect(seen.user.id).toBe(w.a.inviteId);
    const after = await userRow(owner, w.a.inviteId);
    expect(after).toEqual({
      ...before,
      identity_subject: `sub-new-${w.run}`,
      updated_at: after!.updated_at,
    });
    // A second sign-in takes the bound path and changes nothing further.
    await inside(identity(`sub-new-${w.run}`, w.a.inviteEmail));
    expect(await userRow(owner, w.a.inviteId)).toEqual(after);
  });

  it("refuses an email with no invitation, inserting nothing", async () => {
    const count = await userCount(owner, [w.a.companyId, w.b.companyId]);
    expect(await outcome(inside(identity(`sub-new-${w.run}`, "stranger@co.test")))).toBe(
      "UNAUTHORIZED",
    );
    expect(await owner.$count(users, eq(users.identitySubject, `sub-new-${w.run}`))).toBe(
      0,
    );
    expect(await userCount(owner, [w.a.companyId, w.b.companyId])).toBe(count);
  });

  it("refuses an email invited in two companies, binding neither", async () => {
    await owner
      .update(users)
      .set({ email: w.a.inviteEmail })
      .where(eq(users.id, w.b.inviteId));
    const before = [
      await userRow(owner, w.a.inviteId),
      await userRow(owner, w.b.inviteId),
    ];
    expect(await outcome(inside(identity(`sub-new-${w.run}`, w.a.inviteEmail)))).toBe(
      "UNAUTHORIZED",
    );
    expect([
      await userRow(owner, w.a.inviteId),
      await userRow(owner, w.b.inviteId),
    ]).toEqual(before);
  });

  it("refuses another subject presenting a bound row's email", async () => {
    const before = await userRow(owner, w.a.boundId);
    expect(await outcome(inside(identity(`sub-other-${w.run}`, w.a.boundEmail)))).toBe(
      "UNAUTHORIZED",
    );
    expect(await userRow(owner, w.a.boundId)).toEqual(before);
  });

  it("resolves a deactivated bound user to no user", async () => {
    await owner
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, w.a.boundId));
    expect(await outcome(inside(identity(w.a.boundSubject, w.a.boundEmail)))).toBe(
      "UNAUTHORIZED",
    );
  });

  it("never binds a deactivated invitation", async () => {
    await owner
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, w.a.inviteId));
    const before = await userRow(owner, w.a.inviteId);
    expect(await outcome(inside(identity(`sub-new-${w.run}`, w.a.inviteEmail)))).toBe(
      "UNAUTHORIZED",
    );
    expect(await userRow(owner, w.a.inviteId)).toEqual(before);
  });
});

describe("concurrent first sign-in", () => {
  // The owner holds the invitation's row lock until both requests are blocked in their bind
  // UPDATE, so both have already read the invitation as unbound: the race is forced, not hoped
  // for. `hold` is the statement that takes the lock and is committed on release.
  async function race(hold: ReturnType<typeof sql>, calls: (() => Promise<unknown>)[]) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = owner.transaction(async (tx) => {
      await tx.execute(hold);
      await released;
    });
    // Let the holder take its lock before the requests start.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const results = calls.map((call) => outcome(call()));
    await waitForBlockedUpdates(owner, calls.length);
    release();
    await holder;
    return Promise.all(results);
  }

  const lock = (id: string) => sql`select 1 from users where id = ${id} for update`;

  it("binds once when one subject signs in twice at once; both resolve to the row", async () => {
    const who = identity(`sub-new-${w.run}`, w.a.inviteEmail);
    const results = await race(lock(w.a.inviteId), [
      () => inside(who),
      () => inside(who),
    ]);
    expect(results).toEqual(["OK", "OK"]);
    expect(await userRow(owner, w.a.inviteId)).toMatchObject({
      identity_subject: `sub-new-${w.run}`,
    });
  });

  it("lets exactly one of two subjects with the same email bind", async () => {
    const results = await race(lock(w.a.inviteId), [
      () => inside(identity(`sub-one-${w.run}`, w.a.inviteEmail)),
      () => inside(identity(`sub-two-${w.run}`, w.a.inviteEmail)),
    ]);
    expect(results.sort()).toEqual(["OK", "UNAUTHORIZED"]);
    const bound = (await userRow(owner, w.a.inviteId))!.identity_subject;
    expect([`sub-one-${w.run}`, `sub-two-${w.run}`]).toContain(bound);
  });

  it("answers UNAUTHORIZED, not an internal error, when one subject binds two rows at once", async () => {
    // Both invitations locked; each request binds a different row to the same subject, and
    // the second to commit meets users_identity_subject_unique.
    const both = sql`select 1 from users where id in (${w.a.inviteId}, ${w.b.inviteId}) for update`;
    const results = await race(both, [
      () => inside(identity(`sub-same-${w.run}`, w.a.inviteEmail)),
      () => inside(identity(`sub-same-${w.run}`, w.b.inviteEmail)),
    ]);
    expect(results.sort()).toEqual(["OK", "UNAUTHORIZED"]);
    const subjects = [
      (await userRow(owner, w.a.inviteId))!.identity_subject,
      (await userRow(owner, w.b.inviteId))!.identity_subject,
    ];
    expect(subjects.filter((s) => s === `sub-same-${w.run}`)).toHaveLength(1);
    expect(subjects).toContain(null);
  });

  it("does not bind an invitation deactivated while the bind waits", async () => {
    const deactivate = sql`update users set deactivated_at = now() where id = ${w.a.inviteId}`;
    const [result] = await race(deactivate, [
      () => inside(identity(`sub-new-${w.run}`, w.a.inviteEmail)),
    ]);
    expect(result).toBe("UNAUTHORIZED");
    const row = await userRow(owner, w.a.inviteId);
    expect(row).toMatchObject({ identity_subject: null });
    expect(row!.deactivated_at).not.toBeNull();
  });
});
