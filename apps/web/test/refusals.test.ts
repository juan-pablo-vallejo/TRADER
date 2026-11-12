// TASKS, Stage 4 (V1-D04): refused entries over the real transport — the route module as Next
// calls it. A phone's push that fails as a whole leaves one line under the request's id, and
// the admin finds it by the sender and the day; nobody else may read it, and a request that
// never reaches the procedure leaves nothing.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { syncDiagnostics } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { ENDPOINT } from "../src/server/handler";
import { invitation, mutate, ownerDb, query } from "./helpers";

const owner = ownerDb();
let admin: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(async () => {
  await admin.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

const as = (email: string) => ({
  [DEV_SUBJECT_HEADER]: `dev:${email}`,
  [DEV_EMAIL_HEADER]: email,
});

const stored = () =>
  owner
    .select()
    .from(syncDiagnostics)
    .where(eq(syncDiagnostics.companyId, admin.companyId));

// The day the database would call today in the fixture company's zone.
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

describe("refused entries through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker", async () => {
    const input = { userId: admin.userId, day: today() };
    expect((await query(GET, "diagnostic.list", { input })).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "diagnostic.list", {
        input: { userId: worker.userId, day: today() },
        headers: as(worker.email),
      });
      expect(r.status).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });

  it("keeps one line for a push that failed as a whole, and the admin finds it by sender and day", async () => {
    // Signed in once, so the caller is bound: a push never signs anyone in for a line.
    expect((await query(GET, "me.get", { headers: as(admin.email) })).status).toBe(200);
    const pushed = await mutate(POST, "sync.push", {
      input: { protocolVersion: 2, deviceNow: "now", records: [] },
      headers: as(admin.email),
    });
    expect(pushed.status).toBe(400);
    const rows = await stored();
    expect(rows).toMatchObject([
      {
        userId: admin.userId,
        recordId: null,
        recordKind: null,
        outcome: "request_failed",
        code: "bad_request",
      },
    ]);
    const list = await query(GET, "diagnostic.list", {
      input: { userId: admin.userId, day: today() },
      headers: as(admin.email),
    });
    expect(list.status).toBe(200);
    expect(list.body.result?.data.json).toMatchObject([
      { requestId: rows[0]!.requestId, outcome: "request_failed", code: "bad_request" },
    ]);
    // Nothing of the refusal reaches the phone but the answer it already had.
    expect(JSON.stringify(pushed.body)).not.toContain(rows[0]!.requestId);
    expect(pushed.headers.get("x-request-id")).toBeNull();
  });

  it("keeps a line for a body that is not JSON, and nothing for a caller never signed in", async () => {
    expect((await query(GET, "me.get", { headers: as(admin.email) })).status).toBe(200);
    const send = (headers: Record<string, string>) =>
      POST(
        new Request(`http://test${ENDPOINT}/sync.push`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: "{ not json",
        }),
      );
    const unbound = await invitation(owner);
    try {
      expect((await send(as(unbound.email))).status).toBeGreaterThanOrEqual(400);
      expect(
        await owner
          .select()
          .from(syncDiagnostics)
          .where(eq(syncDiagnostics.companyId, unbound.companyId)),
      ).toEqual([]);
    } finally {
      await unbound.cleanup();
    }
    const response = await send(as(admin.email));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await stored()).map((r) => [r.outcome, r.recordId])).toEqual([
      ["request_failed", null],
    ]);
  });
});
