// TASKS:45: the roster over the real transport — the route module as Next calls it, the
// development headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an
// admin's invite answering `invited` then `email_taken` through POST.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
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

    const input = { email: `crew-${admin.run}@web.test`, name: "Crew Member" };
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
      input: { ...input, email: input.email.toUpperCase() },
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

  it("refuses an invite by POST from a worker with 403", async () => {
    const worker = await invitation(owner);
    try {
      const r = await mutate(POST, "roster.invite", {
        input: { email: `x-${worker.run}@web.test`, name: "X" },
        headers: as(worker.email),
      });
      expect(r.status).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });
});
