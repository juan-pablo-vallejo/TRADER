// TASKS:45: the roster over the real transport — the route module as Next calls it, the
// development headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an
// admin's invite answering `invited` then `email_taken` through POST, and an invitation by
// mobile number that the number's own login then binds.
import { DEV_EMAIL_HEADER, DEV_PHONE_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import type { Db } from "@trader/db";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { DEV_EMAIL_COOKIE } from "../src/server/identity";
import { disposableDb, invitation, mutate, query } from "./helpers";

// A database of its own: an invitation leaves an audit_log row, which is append-only and
// references the company and the admin, so no fixture here could be deleted again. The route
// handler's pool is pointed at it before the first request.
let D: Awaited<ReturnType<typeof disposableDb>>;
let owner: Db;
let admin: Awaited<ReturnType<typeof invitation>>;

beforeAll(async () => {
  D = await disposableDb();
  owner = D.owner;
  getDb(D.env);
}, 60_000);
beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await D.drop([getDb()]);
});

const as = (email: string) => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

describe("the roster through the route handler", () => {
  it("answers 401 anonymous and 403 as a worker, with no-store", async () => {
    const anonymous = await query(GET, "roster.list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "roster.list", { headers: as(worker.email) });
      expect(r.status).toBe(403);
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
    } finally {
      await worker.cleanup();
    }
  });

  it("lists the roster for an admin and invites by POST, then answers email_taken", async () => {
    const list = await query(GET, "roster.list", { headers: as(admin.email) });
    expect(list.status).toBe(200);
    expect(list.body.result?.data.json).toMatchObject([
      { id: admin.userId, role: "admin" },
    ]);

    const input = {
      email: `crew-${admin.run}@web.test`,
      phone: "(401) 555-0143",
      name: "Crew Member",
    };
    const first = await mutate(POST, "roster.invite", {
      input,
      headers: as(admin.email),
    });
    expect(first.status).toBe(200);
    expect(first.body.result?.data.json).toMatchObject({
      result: "invited",
      user: { email: input.email, role: "worker", invited: true },
    });
    const second = await mutate(POST, "roster.invite", {
      input: { ...input, phone: "(401) 555-0144", email: input.email.toUpperCase() },
      headers: as(admin.email),
    });
    expect(second.status).toBe(200);
    expect(second.body.result?.data.json).toEqual({
      result: "rejected",
      code: "email_taken",
    });

    const after = await query(GET, "roster.list", { headers: as(admin.email) });
    expect((after.body.result?.data.json as unknown[]).length).toBe(2);
  });

  it("invites by mobile number, answers phone_taken, and signs that number in", async () => {
    const phone = "+14015550142";
    const first = await mutate(POST, "roster.invite", {
      input: { phone: "(401) 555-0142", name: "Crew By Number" },
      headers: as(admin.email),
    });
    expect(first.status).toBe(200);
    expect(first.body.result?.data.json).toMatchObject({
      result: "invited",
      user: { email: null, signInPhone: phone, role: "worker", invited: true },
    });
    const second = await mutate(POST, "roster.invite", {
      input: { phone: "401-555-0142", name: "Again" },
      headers: as(admin.email),
    });
    expect(second.body.result?.data.json).toEqual({
      result: "rejected",
      code: "phone_taken",
    });
    const neither = await mutate(POST, "roster.invite", {
      input: { name: "No Address" },
      headers: as(admin.email),
    });
    expect(neither.status).toBe(400);
    // An email alone is not an invitation: everyone signs in with a number.
    const emailOnly = await mutate(POST, "roster.invite", {
      input: { email: `only-${admin.run}@web.test`, name: "Email Only" },
      headers: as(admin.email),
    });
    expect(emailOnly.status).toBe(400);

    // The number's own login, with no email at all. The admin's browser cookie rides along
    // and is not bridged over a request that names its own development identity.
    const crew = {
      [DEV_SUBJECT_HEADER]: `dev:${phone}`,
      [DEV_PHONE_HEADER]: phone,
      cookie: `${DEV_EMAIL_COOKIE}=${encodeURIComponent(admin.email)}`,
    };
    const me = await query(GET, "me.get", { headers: crew });
    expect(me.status).toBe(200);
    expect(me.body.result?.data.json).toMatchObject({
      id: (first.body.result?.data.json as { user: { id: string } }).user.id,
      email: null,
      signInPhone: phone,
      role: "worker",
    });
    // A development header with no subject is no identity: the cookie is not bridged around
    // it into the admin's login with a number attached.
    const { [DEV_SUBJECT_HEADER]: _subject, ...noSubject } = crew;
    expect((await query(GET, "me.get", { headers: noSubject })).status).toBe(401);
    // A second login presenting the number is nobody.
    const other = await query(GET, "me.get", {
      headers: { [DEV_SUBJECT_HEADER]: "dev:someone-else", [DEV_PHONE_HEADER]: phone },
    });
    expect(other.status).toBe(401);
  });

  it("refuses an invite by POST from a worker with 403", async () => {
    const worker = await invitation(owner);
    try {
      const r = await mutate(POST, "roster.invite", {
        input: { phone: "(401) 555-0145", name: "X" },
        headers: as(worker.email),
      });
      expect(r.status).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });
});
