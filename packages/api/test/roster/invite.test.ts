// roster.invite — a users row with a sign-in address (a mobile number, an email, or both),
// name and role, worker unless named, bound by the first sign-in verified for either address;
// a second use of an address in the company is `email_taken` or `phone_taken` with nothing
// written and no error; admin only.
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
  phoneIdentity,
  testPhone,
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

// An E.164 number as an admin might type it.
const typed = (e164: string) =>
  `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;

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

  it("inserts an invitation by number alone that a sign-in with that number binds", async () => {
    const admin = await member(owner, w, "a", "admin");
    const phone = testPhone();
    const answer = await invite(admin.who, { phone: typed(phone), name: "Crew Member" });
    expect(answer).toMatchObject({
      result: "invited",
      user: {
        email: null,
        signInPhone: phone,
        phone: null,
        role: "worker",
        invited: true,
      },
    });
    if (answer.result !== "invited") throw new Error("unreachable");
    expect(await userRow(owner, answer.user.id)).toMatchObject({
      company_id: w.a.companyId,
      email: null,
      sign_in_phone: phone,
      phone: null,
      identity_subject: null,
    });
    // Another number is no one; the number itself is this row, once.
    const stranger = phoneIdentity(`sub-stranger-${w.run}`, testPhone());
    expect(await outcome(appCaller(app, stranger).me.get())).toBe("UNAUTHORIZED");
    const me = await appCaller(app, phoneIdentity(`sub-crew-${w.run}`, phone)).me.get();
    expect(me).toMatchObject({ id: answer.user.id, email: null, signInPhone: phone });
    const second = phoneIdentity(`sub-crew-2-${w.run}`, phone);
    expect(await outcome(appCaller(app, second).me.get())).toBe("UNAUTHORIZED");
    // The audit row carries the role and neither address.
    expect(await auditRows(owner, w.a.companyId)).toEqual([
      auditRow(w.a.companyId, admin.id, "users.invite", answer.user.id, {
        after: { role: "worker" },
      }),
    ]);
  });

  it("takes a number and an email together", async () => {
    const admin = await member(owner, w, "a", "admin");
    const phone = testPhone();
    const email = `both-${w.run}@co.test`;
    const answer = await invite(admin.who, { email, phone, name: "Both", role: "admin" });
    expect(answer).toMatchObject({
      result: "invited",
      user: { email, signInPhone: phone, role: "admin" },
    });
  });

  it("stores a number in E.164 however it is typed, and answers phone_taken for each other form", async () => {
    const admin = await member(owner, w, "a", "admin");
    const phone = testPhone();
    const ten = phone.slice(2);
    const forms = [
      `${ten.slice(0, 3)}.${ten.slice(3, 6)}.${ten.slice(6)}`,
      ten,
      `1-${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`,
      `+1 ${typed(phone)}`,
      phone,
    ];
    const first = await invite(admin.who, { phone: forms[0]!, name: "First" });
    expect(first).toMatchObject({ result: "invited", user: { signInPhone: phone } });
    const before = await userCount(owner, [w.a.companyId]);
    for (const form of forms) {
      expect(await invite(admin.who, { phone: form, name: "Again" })).toEqual({
        result: "rejected",
        code: "phone_taken",
      });
    }
    // A new email beside the held number is still the number's refusal; a held email beside
    // it is named first.
    expect(
      await invite(admin.who, { phone, email: `fresh-${w.run}@co.test`, name: "Again" }),
    ).toEqual({ result: "rejected", code: "phone_taken" });
    expect(
      await invite(admin.who, { phone, email: w.a.boundEmail, name: "Again" }),
    ).toEqual({ result: "rejected", code: "email_taken" });
    expect(await userCount(owner, [w.a.companyId])).toBe(before);
    expect(await auditRows(owner, w.a.companyId)).toHaveLength(1);
  });

  it("invites the same number in another company, and then it binds in neither", async () => {
    const adminA = await member(owner, w, "a", "admin");
    const adminB = await member(owner, w, "b", "admin");
    const phone = testPhone();
    const a = await invite(adminA.who, { phone, name: "Here" });
    const b = await invite(adminB.who, { phone, name: "There" });
    if (a.result !== "invited" || b.result !== "invited") throw new Error("unreachable");
    expect(await userRow(owner, b.user.id)).toMatchObject({ company_id: w.b.companyId });
    const who = phoneIdentity(`sub-two-${w.run}`, phone);
    expect(await outcome(appCaller(app, who).me.get())).toBe("UNAUTHORIZED");
    for (const id of [a.user.id, b.user.id]) {
      expect(await userRow(owner, id)).toMatchObject({ identity_subject: null });
    }
  });

  it("refuses no address, or a number that is not a United States or Canada one", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await userCount(owner, [w.a.companyId]);
    for (const input of [
      { name: "Nobody" },
      { phone: "", name: "Name" },
      { phone: "555-0100", name: "Name" },
      { phone: "+44 1632 960100", name: "Name" },
      { phone: "+52 55 1234 5678", name: "Name" },
      // Ten digits, but written with another country's prefix: not read as a +1 number.
      { phone: "+40 1234 5678", name: "Name" },
      { phone: "(101) 555-0100", name: "Name" },
      { phone: "2-401-555-0100", name: "Name" },
      { email: `x-${w.run}@co.test`, phone: "not a number", name: "Name" },
    ]) {
      expect(await outcome(invite(admin.who, input as Input))).toBe("BAD_REQUEST");
    }
    expect(await userCount(owner, [w.a.companyId])).toBe(before);
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
