// TASKS:45: roster.invite — a users row with email, name and role, worker unless named, bound
// by the first sign-in with that email; a second email per company, whatever its case, is
// `email_taken` with nothing written and no error; admin only.
import type { Db } from "@trader/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "../../src/router";
import {
  appCaller,
  auditRow,
  auditRows,
  disposableDb,
  failure,
  http,
  identity,
  member,
  outcome,
  userCount,
  userRow,
  withoutAuditInsert,
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
  app = D.app();
}, 60_000);
beforeEach(async () => {
  w = await world(owner);
});
afterAll(async () => {
  await D.drop();
});

type Input = Parameters<ReturnType<typeof appCaller>["roster"]["invite"]>[0];
const invite = (who: unknown, input: Input) => appCaller(app, who).roster.invite(input);

describe("roster.invite", () => {
  it("inserts a worker invitation that the first sign-in with that email binds", async () => {
    const admin = await member(owner, w, "a", "admin");
    const email = `new-${w.run}@co.test`;
    const answer = await invite(admin.who, { email, name: "  New Person " });
    expect(answer).toMatchObject({
      result: "invited",
      user: {
        email,
        name: "New Person",
        role: "worker",
        invited: true,
        deactivatedAt: null,
      },
    });
    if (answer.result !== "invited") throw new Error("unreachable");
    expect(await userRow(owner, answer.user.id)).toMatchObject({
      company_id: w.a.companyId,
      identity_subject: null,
    });
    const me = await appCaller(app, identity(`sub-new-${w.run}`, email)).me.get();
    expect(me.id).toBe(answer.user.id);
    const rows = await appCaller(app, admin.who).roster.list();
    expect(rows.find((r) => r.id === answer.user.id)).toMatchObject({ invited: false });
    // One row, by the admin, about the invited user: the role and no contact data. The
    // first sign-in's bind is not an audited action and left nothing.
    expect(await auditRows(owner, w.a.companyId)).toEqual([
      auditRow(w.a.companyId, admin.id, "users.invite", answer.user.id, {
        after: { role: "worker" },
      }),
    ]);
  });

  it("takes the role named", async () => {
    const admin = await member(owner, w, "a", "admin");
    const answer = await invite(admin.who, {
      email: `second-admin-${w.run}@co.test`,
      name: "Second",
      role: "admin",
    });
    expect(answer).toMatchObject({ result: "invited", user: { role: "admin" } });
    expect(await auditRows(owner, w.a.companyId)).toMatchObject([
      { action: "users.invite", before: null, after: { role: "admin" } },
    ]);
  });

  it("answers email_taken for an email of this company, whatever its case, writing nothing", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await userCount(owner, [w.a.companyId]);
    for (const email of [w.a.boundEmail, w.a.boundEmail.toUpperCase()]) {
      expect(await invite(admin.who, { email, name: "Again" })).toEqual({
        result: "rejected",
        code: "email_taken",
      });
    }
    expect(await userCount(owner, [w.a.companyId])).toBe(before);
    expect(await auditRows(owner, w.a.companyId)).toEqual([]);
  });

  it("invites the same email in another company", async () => {
    const adminB = await member(owner, w, "b", "admin");
    const answer = await invite(adminB.who, {
      email: w.a.boundEmail,
      name: "Same email",
    });
    expect(answer).toMatchObject({ result: "invited", user: { email: w.a.boundEmail } });
    if (answer.result !== "invited") throw new Error("unreachable");
    expect(await userRow(owner, answer.user.id)).toMatchObject({
      company_id: w.b.companyId,
    });
    // The row is the inviting company's, and the other company has none.
    expect(await auditRows(owner, w.b.companyId)).toEqual([
      auditRow(w.b.companyId, adminB.id, "users.invite", answer.user.id, {
        after: { role: "worker" },
      }),
    ]);
    expect(await auditRows(owner, w.a.companyId)).toEqual([]);
  });

  it("refuses a blank name, a bad email or an unknown field with BAD_REQUEST", async () => {
    const admin = await member(owner, w, "a", "admin");
    for (const input of [
      { email: `x-${w.run}@co.test`, name: "   " },
      { email: "not an email", name: "Name" },
      { email: `x-${w.run}@co.test`, name: "Name", companyId: w.b.companyId },
    ]) {
      expect(await outcome(invite(admin.who, input as Input))).toBe("BAD_REQUEST");
    }
    expect(await auditRows(owner, w.a.companyId)).toEqual([]);
  });

  it("is admin only, over HTTP too", async () => {
    const input = { email: `gate-${w.run}@co.test`, name: "Gate" };
    const worker = await member(owner, w, "a", "worker");
    expect(await outcome(invite(worker.who, input))).toBe("FORBIDDEN");
    expect(await outcome(invite(null, input))).toBe("UNAUTHORIZED");
    const r = await http(
      app,
      worker.who,
      [{ path: "roster.invite", input, mutation: true }],
      {
        router: appRouter,
      },
    );
    expect({ status: r.status, ...failure(r.results[0]) }).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(await auditRows(owner, w.a.companyId)).toEqual([]);
  });

  it("invites no one when its audit row cannot be written", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await userCount(owner, [w.a.companyId]);
    await withoutAuditInsert(owner, async () => {
      expect(
        await outcome(
          invite(admin.who, { email: `lost-${w.run}@co.test`, name: "Lost" }),
        ),
      ).toBe("INTERNAL_SERVER_ERROR");
    });
    expect(await userCount(owner, [w.a.companyId])).toBe(before);
    expect(await auditRows(owner, w.a.companyId)).toEqual([]);
  });
});
