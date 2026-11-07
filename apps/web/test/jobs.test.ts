// TASKS:46: jobs over the real transport — the route module as Next calls it, the development
// headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an admin's
// create, list, archive and un-archive through POST and GET.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { customers } from "@trader/db/schema";
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

describe("jobs through the route handler", () => {
  it("answers 401 anonymous and 403 as a worker", async () => {
    expect((await query(GET, "job.list")).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "job.list", { headers: as(worker.email) });
      expect(r.status).toBe(403);
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
    } finally {
      await worker.cleanup();
    }
  });

  it("creates by POST with a location, lists by GET, archives and un-archives", async () => {
    const [customer] = await owner
      .insert(customers)
      .values({ companyId: admin.companyId, name: "Smith Residence" })
      .returning({ id: customers.id });
    const created = await mutate(POST, "job.create", {
      input: {
        customerId: customer!.id,
        name: "Kitchen",
        address: "",
        location: { lat: 41.8, lng: -71.4, radiusM: 150 },
      },
      headers: as(admin.email),
    });
    expect(created.status).toBe(200);
    const job = (created.body.result?.data.json as { job: { id: string } }).job;
    expect(job).toMatchObject({
      name: "Kitchen",
      address: null,
      location: { lat: 41.8, lng: -71.4, radiusM: 150 },
      status: "open",
      customer: { id: customer!.id, name: "Smith Residence" },
      crew: null,
    });
    const list = await query(GET, "job.list", { headers: as(admin.email) });
    expect(list.status).toBe(200);
    expect(list.body.result?.data.json).toEqual([job]);
    for (const status of ["archived", "open"]) {
      const r = await mutate(POST, "job.setStatus", {
        input: { jobId: job.id, status },
        headers: as(admin.email),
      });
      expect(r.status).toBe(200);
      expect(r.body.result?.data.json).toMatchObject({
        result: "updated",
        job: { status },
      });
    }
  });
});
