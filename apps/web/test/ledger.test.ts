// TASKS, Stage 4: the worker ledger read over the real transport — the route module as Next
// calls it. The admin reads a person of their own company; nobody else may, and another
// company's person is refused. No labor is committed here: a ledger row can never be removed,
// and what the read derives from one is the api suite's (labor/ledger.test.ts).
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
import { invitation, ownerDb, query } from "./helpers";

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

const WEEK = { from: "2026-10-05", to: "2026-10-11" };

describe("the worker ledger through the route handler", () => {
  it("answers 401 anonymous, 403 to a worker, and 403 for another company's person", async () => {
    const input = { workerId: admin.userId, ...WEEK };
    expect((await query(GET, "labor.ledger", { input })).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const own = await query(GET, "labor.ledger", {
        input: { workerId: worker.userId, ...WEEK },
        headers: as(worker.email),
      });
      expect(own.status).toBe(403);
      const theirs = await query(GET, "labor.ledger", {
        input: { workerId: worker.userId, ...WEEK },
        headers: as(admin.email),
      });
      expect(theirs.status).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });

  it("answers an admin with the person and an empty ledger, and refuses a range past 31 days", async () => {
    const read = await query(GET, "labor.ledger", {
      input: { workerId: admin.userId, ...WEEK },
      headers: as(admin.email),
    });
    expect(read.status).toBe(200);
    expect(read.body.result?.data.json).toEqual({
      worker: {
        id: admin.userId,
        name: `Invite ${admin.run}`,
        role: "admin",
        active: true,
      },
      timezone: "America/New_York",
      openSession: null,
      sessions: [],
    });
    const long = await query(GET, "labor.ledger", {
      input: { workerId: admin.userId, from: "2026-10-01", to: "2026-11-01" },
      headers: as(admin.email),
    });
    expect(long.status).toBe(400);
  });
});
