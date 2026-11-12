// TASKS, Stage 4: the reconciliation's read over the real transport — the route module as
// Next calls it. `labor.hours` is the office's alone; a range with nothing in it answers
// zeros in the shape the screen reads, and a range past 31 days is refused. No labor is
// committed here: a ledger row can never be removed, and what the read derives from one is
// the api suite's (labor/day-hours.test.ts).
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

describe("hours for the reconciliation through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker and a foreman", async () => {
    expect((await query(GET, "labor.hours", { input: WEEK })).status).toBe(401);
    for (const role of ["worker", "foreman"] as const) {
      const other = await invitation(owner, { role });
      try {
        const r = await query(GET, "labor.hours", {
          input: WEEK,
          headers: as(other.email),
        });
        expect([role, r.status]).toEqual([role, 403]);
      } finally {
        await other.cleanup();
      }
    }
  });

  it("answers an admin with zeros for days nothing is recorded on, and refuses 32 days", async () => {
    const read = await query(GET, "labor.hours", {
      input: WEEK,
      headers: as(admin.email),
    });
    expect(read.status).toBe(200);
    expect(read.body.result?.data.json).toEqual({
      timezone: "America/New_York",
      cells: [],
      workers: [],
      totals: {
        approvedHundredths: 0,
        pendingHundredths: 0,
        pendingSessions: 0,
        rejectedSessions: 0,
        openSessions: 0,
      },
    });
    const month = await query(GET, "labor.hours", {
      input: { from: "2026-10-01", to: "2026-10-31" },
      headers: as(admin.email),
    });
    expect(month.status).toBe(200);
    const long = await query(GET, "labor.hours", {
      input: { from: "2026-10-01", to: "2026-11-01" },
      headers: as(admin.email),
    });
    expect(long.status).toBe(400);
  });
});
