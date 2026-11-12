// TASKS, dated worker-job assignments (V1-D07), over the real transport — the route module as
// Next calls it, the development headers as the cookie bridge sets them: 401 anonymous, 403
// as a worker on the office's procedures, an admin's week planned by POST and read by GET with
// its clock-in flag, and a worker's own plans by GET.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { customers, jobs, users } from "@trader/db/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { getDb } from "../src/server/db";
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

const WEEK = { from: "2026-11-16", to: "2026-11-22" };

describe("assignments through the route handler", () => {
  it("answers 401 anonymous and 403 as a worker, never cached", async () => {
    const anonymous = await query(GET, "assignment.list", { input: WEEK });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "assignment.list", {
        input: WEEK,
        headers: as(worker.email),
      });
      expect(r.status).toBe(403);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
      const write = await mutate(POST, "assignment.create", {
        input: {
          userId: worker.userId,
          jobId: crypto.randomUUID(),
          workDates: ["2026-11-16"],
          expectedStart: "07:00",
          expectedEnd: "15:30",
        },
        headers: as(worker.email),
      });
      expect(write.status).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });

  it("plans a week by POST, lists it by GET with the flag, and shows the worker their own", async () => {
    const email = `painter-${admin.run}@web.test`;
    const [painter] = await owner
      .insert(users)
      .values({ companyId: admin.companyId, email, name: "Painter" })
      .returning({ id: users.id });
    const [customer] = await owner
      .insert(customers)
      .values({ companyId: admin.companyId, name: "Customer" })
      .returning({ id: customers.id });
    const [job] = await owner
      .insert(jobs)
      .values({
        companyId: admin.companyId,
        customerId: customer!.id,
        name: "Porch",
        address: "1 Main St",
      })
      .returning({ id: jobs.id });
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
    const created = await mutate(POST, "assignment.create", {
      input: {
        userId: painter!.id,
        jobId: job!.id,
        workDates: days,
        expectedStart: "07:00",
        expectedEnd: "15:30",
      },
      headers: as(admin.email),
    });
    expect(created.status).toBe(200);
    expect(created.body.result?.data.json).toEqual({
      result: "created",
      created: 5,
      existing: 0,
    });

    const list = await query(GET, "assignment.list", {
      input: WEEK,
      headers: as(admin.email),
    });
    expect(list.status).toBe(200);
    const rows = list.body.result?.data.json as Record<string, unknown>[];
    expect(rows.map((r) => r.workDate)).toEqual(days);
    // The job has no crew: planned all the same, and the office is told.
    expect(rows[0]).toMatchObject({
      expectedStart: "07:00",
      expectedEnd: "15:30",
      worker: { id: painter!.id, name: "Painter", active: true },
      job: { id: job!.id, name: "Porch", status: "open" },
      mayClockIn: false,
      blockedBy: "crew",
    });

    const mine = await query(GET, "assignment.mine", { input: WEEK, headers: as(email) });
    expect(mine.status).toBe(200);
    const own = mine.body.result?.data.json as Record<string, unknown>[];
    expect(own).toHaveLength(5);
    expect(own[0]).toEqual({
      id: rows[0]!.id,
      workDate: "2026-11-16",
      expectedStart: "07:00",
      expectedEnd: "15:30",
      job: { id: job!.id, name: "Porch", address: "1 Main St" },
    });
    // The admin planned nobody on themselves.
    const none = await query(GET, "assignment.mine", {
      input: WEEK,
      headers: as(admin.email),
    });
    expect(none.body.result?.data.json).toEqual([]);
  });
});
