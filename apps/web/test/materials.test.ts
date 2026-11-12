// TASKS, Stage 4: material cost entry over the real transport — the route module as Next calls
// it. An admin reads their company's receipts and states what one cost; nobody else does
// either, and a receipt that is not theirs to see is refused. A receipt no closeout covers
// can be deleted, so this runs on committed fixtures; the frozen ones and the locks are the
// api suite's (materials/).
import { DEV_EMAIL_HEADER, DEV_SUBJECT_HEADER } from "@trader/api";
import { customers, jobs, materials } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../src/app/api/trpc/[trpc]/route";
import { uuidv7 } from "../src/app/closeout/uuidv7";
import { getDb } from "../src/server/db";
import { invitation, mutate, ownerDb, query } from "./helpers";

const owner = ownerDb();
let admin: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  admin = await invitation(owner, { role: "admin" });
  vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
});
afterEach(async () => {
  await owner.delete(materials).where(eq(materials.companyId, admin.companyId));
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

// A well-formed version 7 id no receipt has.
const NO_RECEIPT = "0193a1b2-c3d4-7e5f-8a6b-0123456789ab";
const usd = (cents: number) => ({ cents, currency: "USD" });

// One receipt on one job, logged by the admin's own row, as the owner writes it.
async function receipt() {
  const companyId = admin.companyId;
  const id = uuidv7();
  const [customer] = await owner
    .insert(customers)
    .values({ companyId, name: "Customer" })
    .returning({ id: customers.id });
  const [job] = await owner
    .insert(jobs)
    .values({ companyId, customerId: customer!.id, name: "Harbor Street" })
    .returning({ id: jobs.id });
  await owner.insert(materials).values({
    id,
    companyId,
    jobId: job!.id,
    loggedByUserId: admin.userId,
    description: "Eggshell, white",
    quantity: "2.000",
    unit: "gal",
    loggedAt: new Date("2026-10-05T15:00:00Z"),
    capturedOffline: false,
    clockSkewed: false,
    clockSkewMs: 0,
  });
  return { id, jobId: job!.id };
}

describe("material cost entry through the route handler", () => {
  it("answers 401 anonymous and 403 to a worker, read and write", async () => {
    const entry = { materialId: NO_RECEIPT, cost: usd(100) };
    expect((await query(GET, "material.list", { input: {} })).status).toBe(401);
    expect((await mutate(POST, "material.setCost", { input: entry })).status).toBe(401);
    const worker = await invitation(owner);
    try {
      const headers = as(worker.email);
      expect((await query(GET, "material.list", { input: {}, headers })).status).toBe(
        403,
      );
      expect(
        (await mutate(POST, "material.setCost", { input: entry, headers })).status,
      ).toBe(403);
    } finally {
      await worker.cleanup();
    }
  });

  it("answers an admin with the company's zone and no receipts", async () => {
    const read = await query(GET, "material.list", {
      input: {},
      headers: as(admin.email),
    });
    expect(read.status).toBe(200);
    expect(read.body.result?.data.json).toEqual({
      timezone: "America/New_York",
      items: [],
      next: null,
    });
  });

  it("lets an admin price a receipt, read it back, and clear it", async () => {
    const headers = as(admin.email);
    const { id: RECEIPT, jobId } = await receipt();
    const unpriced = () => query(GET, "material.list", { input: { jobId }, headers });
    const listed = (await unpriced()).body.result?.data.json as {
      items: { id: string; cost: unknown }[];
    };
    expect(listed.items).toMatchObject([{ id: RECEIPT, cost: null }]);

    const saved = await mutate(POST, "material.setCost", {
      input: { materialId: RECEIPT, cost: usd(8999) },
      headers,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.result?.data.json).toEqual({ result: "saved", cost: usd(8999) });
    const again = await mutate(POST, "material.setCost", {
      input: { materialId: RECEIPT, cost: usd(8999) },
      headers,
    });
    expect(again.body.result?.data.json).toEqual({
      result: "unchanged",
      cost: usd(8999),
    });

    // Priced: gone from the default list, there with its cost when all are asked for.
    expect((await unpriced()).body.result?.data.json).toMatchObject({ items: [] });
    const all = await query(GET, "material.list", {
      input: { jobId, show: "all" },
      headers,
    });
    expect(all.body.result?.data.json).toMatchObject({
      items: [
        {
          id: RECEIPT,
          job: { id: jobId, name: "Harbor Street" },
          effective: { description: "Eggshell, white", quantity: "2.000", unit: "gal" },
          accounting: "eligible",
          cost: usd(8999),
        },
      ],
    });

    const cleared = await mutate(POST, "material.setCost", {
      input: { materialId: RECEIPT, cost: null },
      headers,
    });
    expect(cleared.body.result?.data.json).toEqual({ result: "saved", cost: null });
    expect((await unpriced()).body.result?.data.json).toMatchObject({
      items: [{ id: RECEIPT, cost: null }],
    });
  });

  it("refuses an admin a receipt they cannot see, and a malformed cost", async () => {
    const headers = as(admin.email);
    const unseen = await mutate(POST, "material.setCost", {
      input: { materialId: NO_RECEIPT, cost: usd(100) },
      headers,
    });
    expect(unseen.status).toBe(403);
    const { id: RECEIPT } = await receipt();
    for (const cost of [{ cents: 89.99, currency: "USD" }, { cents: 100 }, 100]) {
      const malformed = await mutate(POST, "material.setCost", {
        input: { materialId: RECEIPT, cost },
        headers,
      });
      expect([cost, malformed.status]).toEqual([cost, 400]);
    }
    const [row] = await owner
      .select({ costCents: materials.costCents })
      .from(materials)
      .where(eq(materials.id, RECEIPT));
    expect(row).toEqual({ costCents: null });
  });
});
