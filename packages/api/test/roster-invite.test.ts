// TASKS:45: roster.invite — a users row with email, name and role, worker unless named, bound
// by the first sign-in with that email; a second email per company, whatever its case, is
// `email_taken` with nothing written and no error; admin only.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "../src/router";
import {
  appCaller,
  appDb,
  failure,
  http,
  identity,
  member,
  outcome,
  ownerDb,
  userCount,
  userRow,
  world,
  type World,
} from "./helpers";

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
  });

  it("takes the role named", async () => {
    const admin = await member(owner, w, "a", "admin");
    const answer = await invite(admin.who, {
      email: `second-admin-${w.run}@co.test`,
      name: "Second",
      role: "admin",
    });
    expect(answer).toMatchObject({ result: "invited", user: { role: "admin" } });
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
  });
});
