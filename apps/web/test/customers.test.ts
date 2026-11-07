// TASKS:46: customers over the real transport — the route module as Next calls it, the
// development headers as the cookie bridge sets them: 401 anonymous, 403 as a worker, and an
// admin's create, list and deactivation through POST and GET.
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
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

describe("customers through the route handler", () => {
  it("answers 401 anonymous and 403 as a worker", async () => {
    expect((await query(GET, "customer.list")).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const r = await query(GET, "customer.list", { headers: as(worker.email) });
      expect(r.status).toBe(403);
      expect(r.body.error?.json.data.code).toBe("FORBIDDEN");
    } finally {
      await worker.cleanup();
    }
  });

  it("creates by POST, lists by GET, and deactivates", async () => {
    const created = await mutate(POST, "customer.create", {
      input: { name: "Smith Residence", email: "" },
      headers: as(admin.email),
    });
    expect(created.status).toBe(200);
    const customer = (created.body.result?.data.json as { customer: { id: string } })
      .customer;
    expect(customer).toMatchObject({
      name: "Smith Residence",
      email: null,
      unarchivedJobs: 0,
    });
    const list = await query(GET, "customer.list", { headers: as(admin.email) });
    expect(list.status).toBe(200);
    expect(list.body.result?.data.json).toEqual([customer]);
    const off = await mutate(POST, "customer.deactivate", {
      input: { customerId: customer.id },
      headers: as(admin.email),
    });
    expect(off.status).toBe(200);
    expect(off.body.result?.data.json).toMatchObject({ result: "updated" });
  });
});
