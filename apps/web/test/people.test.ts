// The roster over the real transport — the route module as Next calls it, the
// development headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an
// admin's invite answering `invited` then `email_taken` through POST, an invitation by
// mobile number that the number's own login then binds, and an invitation's sends.
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
import { uuidv7 } from "../src/app/uuidv7";
import { getDb } from "../src/server/db";
import { DEV_EMAIL_COOKIE } from "../src/server/identity";
import { disposableDb, invitation, mutate, query } from "./helpers";

// A database of its own: the invitations these requests commit are never deleted, so they
// stay out of the shared one. The route handler's pool is pointed at it before the first
// request.
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
      id: uuidv7(),
      email: `painter-${admin.run}@web.test`,
      phone: "(401) 555-0143",
      name: "New Painter",
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
      input: {
        ...input,
        id: uuidv7(),
        phone: "(401) 555-0144",
        email: input.email.toUpperCase(),
      },
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
      input: { id: uuidv7(), phone: "(401) 555-0142", name: "Painter By Number" },
      headers: as(admin.email),
    });
    expect(first.status).toBe(200);
    expect(first.body.result?.data.json).toMatchObject({
      result: "invited",
      user: { email: null, signInPhone: phone, role: "worker", invited: true },
    });
    const second = await mutate(POST, "roster.invite", {
      input: { id: uuidv7(), phone: "401-555-0142", name: "Again" },
      headers: as(admin.email),
    });
    expect(second.body.result?.data.json).toEqual({
      result: "rejected",
      code: "phone_taken",
    });
    const neither = await mutate(POST, "roster.invite", {
      input: { id: uuidv7(), name: "No Address" },
      headers: as(admin.email),
    });
    expect(neither.status).toBe(400);
    // An email alone is an invitation too: that person signs in by a code sent to it.
    const emailOnly = await mutate(POST, "roster.invite", {
      input: { id: uuidv7(), email: `only-${admin.run}@web.test`, name: "Email Only" },
      headers: as(admin.email),
    });
    expect(emailOnly.status).toBe(200);
    expect(emailOnly.body.result?.data.json).toMatchObject({
      result: "invited",
      user: {
        email: `only-${admin.run}@web.test`,
        signInPhone: null,
        invitation: { status: "not_sent", sends: [] },
      },
    });

    // The number's own login, with no email at all. The admin's browser cookie rides along
    // and is not bridged over a request that names its own development identity.
    const byNumber = {
      [DEV_SUBJECT_HEADER]: `dev:${phone}`,
      [DEV_PHONE_HEADER]: phone,
      cookie: `${DEV_EMAIL_COOKIE}=${encodeURIComponent(admin.email)}`,
    };
    const me = await query(GET, "me.get", { headers: byNumber });
    expect(me.status).toBe(200);
    expect(me.body.result?.data.json).toMatchObject({
      id: (first.body.result?.data.json as { user: { id: string } }).user.id,
      email: null,
      signInPhone: phone,
      role: "worker",
    });
    // A development header with no subject is no identity: the cookie is not bridged around
    // it into the admin's login with a number attached.
    const { [DEV_SUBJECT_HEADER]: _subject, ...noSubject } = byNumber;
    expect((await query(GET, "me.get", { headers: noSubject })).status).toBe(401);
    // A second login presenting the number is nobody.
    const other = await query(GET, "me.get", {
      headers: { [DEV_SUBJECT_HEADER]: "dev:someone-else", [DEV_PHONE_HEADER]: phone },
    });
    expect(other.status).toBe(401);
  });

  it("notes a texted invitation, answers where it stands, and emails only with an address of its own to link to", async () => {
    const email = `both-${admin.run}@web.test`;
    const invited = await mutate(POST, "roster.invite", {
      input: { id: uuidv7(), phone: "(401) 555-0146", email, name: "Painter By Both" },
      headers: as(admin.email),
    });
    const userId = (invited.body.result?.data.json as { user: { id: string } }).user.id;
    const standing = async () => {
      const list = await query(GET, "roster.list", { headers: as(admin.email) });
      const rows = list.body.result?.data.json as {
        id: string;
        invitation: { status: string; sends: { channel: string; outcome: string }[] };
      }[];
      return rows.find((row) => row.id === userId)?.invitation;
    };
    expect(await standing()).toEqual({ status: "not_sent", sends: [] });

    const noted = await mutate(POST, "roster.noteInvitation", {
      input: { id: crypto.randomUUID(), userId },
      headers: as(admin.email),
    });
    expect(noted.body.result?.data.json).toEqual({ result: "noted" });
    expect(await standing()).toMatchObject({
      status: "sent",
      sends: [{ channel: "text", outcome: "sent" }],
    });

    // A server that names no address of its own has no link to mail: nothing is sent.
    vi.stubEnv("TRADER_HOME_HOST", "");
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "");
    const noLink = await mutate(POST, "roster.sendInvitation", {
      input: { id: crypto.randomUUID(), userId },
      headers: as(admin.email),
    });
    expect(noLink.body.result?.data.json).toEqual({
      result: "rejected",
      code: "no_link",
    });
    // With one, the send reaches the mail service, which this server has none of: the
    // failure is recorded and said.
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "https://office.test");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    const unsent = await mutate(POST, "roster.sendInvitation", {
      input: { id: crypto.randomUUID(), userId },
      headers: as(admin.email),
    });
    expect(unsent.body.result?.data.json).toEqual({
      result: "failed",
      failure: "mail_not_configured",
    });
    expect((await standing())?.sends.map((send) => [send.channel, send.outcome])).toEqual(
      [
        ["email", "failed"],
        ["text", "sent"],
      ],
    );
  });

  it("changes a worker's sign-in addresses, keeps the record, and refuses an admin's", async () => {
    const invited = await mutate(POST, "roster.invite", {
      input: { id: uuidv7(), phone: "(401) 555-0147", name: "Painter Readdressed" },
      headers: as(admin.email),
    });
    const user = (invited.body.result?.data.json as { user: { id: string } }).user;
    const email = `moved-${admin.run}@web.test`;
    const given = await mutate(POST, "roster.setEmail", {
      input: { userId: user.id, email },
      headers: as(admin.email),
    });
    expect(given.body.result?.data.json).toMatchObject({
      result: "changed",
      user: {
        email,
        signInPhone: "+14015550147",
        addressChanges: [{ field: "email", from: null, to: email }],
      },
    });
    const moved = await mutate(POST, "roster.setSignInPhone", {
      input: { userId: user.id, phone: "401-555-0148" },
      headers: as(admin.email),
    });
    expect(moved.body.result?.data.json).toMatchObject({
      result: "changed",
      user: { signInPhone: "+14015550148" },
    });
    // The old number signs nobody in; the new one is the person.
    const by = (phone: string) => ({
      [DEV_SUBJECT_HEADER]: `dev:${phone}`,
      [DEV_PHONE_HEADER]: phone,
    });
    expect((await query(GET, "me.get", { headers: by("+14015550147") })).status).toBe(
      401,
    );
    const me = await query(GET, "me.get", { headers: by("+14015550148") });
    expect(me.body.result?.data.json).toMatchObject({ id: user.id });
    // An admin's addresses, the caller's own here, are not the office's to change.
    const own = await query(GET, "me.get", { headers: as(admin.email) });
    const mine = (own.body.result?.data.json as { id: string }).id;
    const refused = await mutate(POST, "roster.setEmail", {
      input: { userId: mine, email: `mine-${admin.run}@web.test` },
      headers: as(admin.email),
    });
    expect(refused.body.result?.data.json).toEqual({ result: "rejected", code: "admin" });
    // And what is not an address is not read as one.
    const bad = await mutate(POST, "roster.setEmail", {
      input: { userId: user.id, email: "not an email" },
      headers: as(admin.email),
    });
    expect(bad.status).toBe(400);
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
