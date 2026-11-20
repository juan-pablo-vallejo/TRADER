// job.list, create, update, setStatus — a job under an active customer, judged
// under FOR SHARE; its customer immutable once invoiced; any status writable, archived
// reversible, and leaving archived re-judging the customer so a deactivated one never regains
// a live job; admin only, a missing or foreign id one FORBIDDEN; a caller deactivated mid-call
// UNAUTHORIZED.
import { customers, invoices, jobs } from "@trader/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { appRouter } from "../../src/router";
import {
  appCaller,
  appDb,
  failure,
  http,
  member,
  outcome,
  ownerDb,
  waitForLockWait,
  world,
  type World,
} from "../helpers";

const owner = ownerDb();
const app = appDb({ max: 4 });
let w: World;

beforeEach(async () => {
  w = await world(owner);
});
afterEach(async () => {
  await w.cleanup();
});
afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

const job = (who: unknown) => appCaller(app, who).job;

type CreateInput = Parameters<ReturnType<typeof job>["create"]>[0];

async function jobIn(
  company: "a" | "b",
  o: {
    name?: string;
    status?: "open" | "complete" | "archived";
  } = {},
) {
  const [row] = await owner
    .insert(jobs)
    .values({
      companyId: w[company].companyId,
      customerId: w[company].customerId,
      name: o.name ?? "Job",
      status: o.status ?? "open",
    })
    .returning({ id: jobs.id });
  return row!.id;
}

const jobRow = async (id: string) =>
  (
    await owner
      .select({
        customerId: jobs.customerId,
        status: jobs.status,
        name: jobs.name,
        lat: jobs.locationLat,
      })
      .from(jobs)
      .where(eq(jobs.id, id))
  )[0];

const deactivateCustomer = (id: string) =>
  owner.update(customers).set({ deactivatedAt: new Date() }).where(eq(customers.id, id));

describe("job.list", () => {
  it("lists the company's jobs by status then name with customer and location", async () => {
    const admin = await member(owner, w, "a", "admin");
    const archived = await jobIn("a", { name: "Attic", status: "archived" });
    const open = await jobIn("a", { name: "zebra" });
    const complete = await jobIn("a", { name: "Barn", status: "complete" });
    await owner
      .update(jobs)
      .set({ locationLat: 41.8, locationLng: -71.4, locationRadiusM: 150 })
      .where(eq(jobs.id, open));
    await jobIn("b");
    const rows = await job(admin.who).list();
    expect(rows.map((r) => r.id)).toEqual([open, complete, archived]);
    expect(rows[0]).toStrictEqual({
      id: open,
      name: "zebra",
      address: null,
      notes: null,
      location: { lat: 41.8, lng: -71.4, radiusM: 150 },
      status: "open",
      customer: { id: w.a.customerId, name: "Customer a" },
      hours: { week: 0, toDate: 0 },
    });
    expect(rows[1]).toMatchObject({ status: "complete", location: null });
  });

  it("answers 401, 403 and 200 over HTTP", async () => {
    const send = async (who: unknown) => {
      const r = await http(app, who, [{ path: "job.list" }], { router: appRouter });
      return { status: r.status, ...failure(r.results[0]) };
    };
    expect(await send(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const worker = await member(owner, w, "a", "worker");
    expect(await send(worker.who)).toMatchObject({ status: 403, code: "FORBIDDEN" });
    const admin = await member(owner, w, "a", "admin");
    expect((await send(admin.who)).status).toBe(200);
  });
});

describe("job.create", () => {
  it("creates under the customer, located or not, with blank address as NULL", async () => {
    const admin = await member(owner, w, "a", "admin");
    const plain = await job(admin.who).create({
      customerId: w.a.customerId,
      name: " Kitchen ",
      address: "  ",
    });
    expect(plain).toMatchObject({
      result: "created",
      job: { name: "Kitchen", address: null, location: null, status: "open" },
    });
    const located = await job(admin.who).create({
      customerId: w.a.customerId,
      name: "Deck",
      address: "1 Main St",
      location: { lat: 41.8, lng: -71.4, radiusM: 100 },
    });
    expect(located).toMatchObject({
      result: "created",
      job: {
        address: "1 Main St",
        location: { lat: 41.8, lng: -71.4, radiusM: 100 },
      },
    });
    if (located.result !== "created") throw new Error("unreachable");
    expect(await jobRow(located.job.id)).toMatchObject({
      customerId: w.a.customerId,
      lat: 41.8,
    });
  });

  it("refuses a deactivated customer, a partial location and an unknown field", async () => {
    const admin = await member(owner, w, "a", "admin");
    const before = await owner.$count(jobs, eq(jobs.companyId, w.a.companyId));
    await deactivateCustomer(w.a.customerId);
    expect(
      await job(admin.who).create({ customerId: w.a.customerId, name: "X" }),
    ).toEqual({
      result: "rejected",
      code: "customer_inactive",
    });
    for (const input of [
      { customerId: w.a.customerId, name: "X", location: { lat: 41.8, lng: -71.4 } },
      { customerId: w.a.customerId, name: "X", status: "archived" },
      { customerId: w.a.customerId, name: " " },
    ]) {
      expect(await outcome(job(admin.who).create(input as CreateInput))).toBe(
        "BAD_REQUEST",
      );
    }
    expect(await owner.$count(jobs, eq(jobs.companyId, w.a.companyId))).toBe(before);
  });
});

describe("a job's notes", () => {
  it("are written by create and update, blank as NULL, and listed", async () => {
    const admin = await member(owner, w, "a", "admin");
    const created = await job(admin.who).create({
      customerId: w.a.customerId,
      name: "Porch",
      notes: " Gate code 4411. Park on the street. ",
    });
    if (created.result !== "created") throw new Error("the job was not created");
    expect(created.job.notes).toBe("Gate code 4411. Park on the street.");
    expect(
      (await job(admin.who).list()).find((j) => j.id === created.job.id),
    ).toMatchObject({
      notes: "Gate code 4411. Park on the street.",
    });
    const facts = { jobId: created.job.id, customerId: w.a.customerId, name: "Porch" };
    expect(
      await job(admin.who).update({ ...facts, notes: "Dog in the yard." }),
    ).toMatchObject({ result: "updated", job: { notes: "Dog in the yard." } });
    // A whole-record replace, as the address is: left out, the notes go.
    expect(await job(admin.who).update({ ...facts, notes: "  " })).toMatchObject({
      result: "updated",
      job: { notes: null },
    });
    expect(
      await outcome(job(admin.who).update({ ...facts, notes: "x".repeat(2001) })),
    ).toBe("BAD_REQUEST");
  });
});

describe("job.update", () => {
  it("replaces the facts and moves the job to another active customer", async () => {
    const admin = await member(owner, w, "a", "admin");
    const id = await jobIn("a", { name: "Old" });
    const [other] = await owner
      .insert(customers)
      .values({ companyId: w.a.companyId, name: "Other" })
      .returning({ id: customers.id });
    const answer = await job(admin.who).update({
      jobId: id,
      customerId: other!.id,
      name: "New",
      address: "2 Main St",
      location: { lat: 1, lng: 2, radiusM: 3 },
    });
    expect(answer).toMatchObject({
      result: "updated",
      job: {
        name: "New",
        address: "2 Main St",
        location: { lat: 1, lng: 2, radiusM: 3 },
        customer: { id: other!.id, name: "Other" },
      },
    });
    expect(await jobRow(id)).toMatchObject({ customerId: other!.id, lat: 1 });
  });

  it("refuses a deactivated customer, and a customer change once an invoice exists", async () => {
    const admin = await member(owner, w, "a", "admin");
    const id = await jobIn("a");
    const [other] = await owner
      .insert(customers)
      .values({ companyId: w.a.companyId, name: "Other", deactivatedAt: new Date() })
      .returning({ id: customers.id });
    const facts = { jobId: id, name: "Job", address: null, location: null };
    expect(await job(admin.who).update({ ...facts, customerId: other!.id })).toEqual({
      result: "rejected",
      code: "customer_inactive",
    });
    await owner
      .update(customers)
      .set({ deactivatedAt: null })
      .where(eq(customers.id, other!.id));
    const [invoice] = await owner
      .insert(invoices)
      .values({
        companyId: w.a.companyId,
        customerId: w.a.customerId,
        jobId: id,
        currency: "USD",
        taxCents: 0,
      })
      .returning({ id: invoices.id });
    try {
      expect(await job(admin.who).update({ ...facts, customerId: other!.id })).toEqual({
        result: "rejected",
        code: "has_invoices",
      });
      // The same customer is no change of customer: the facts still update.
      expect(
        await job(admin.who).update({
          ...facts,
          customerId: w.a.customerId,
          name: "Renamed",
        }),
      ).toMatchObject({ result: "updated", job: { name: "Renamed" } });
    } finally {
      await owner.delete(invoices).where(eq(invoices.id, invoice!.id));
    }
    expect(await jobRow(id)).toMatchObject({ customerId: w.a.customerId });
  });
});

describe("job.setStatus", () => {
  it("writes any status, archived included and back, and answers unchanged for the same", async () => {
    const admin = await member(owner, w, "a", "admin");
    const id = await jobIn("a");
    const set = (status: "open" | "complete" | "archived") =>
      job(admin.who).setStatus({ jobId: id, status });
    expect(await set("open")).toMatchObject({ result: "unchanged" });
    expect(await set("complete")).toMatchObject({
      result: "updated",
      job: { status: "complete" },
    });
    expect(await set("archived")).toMatchObject({
      result: "updated",
      job: { status: "archived" },
    });
    expect(await set("archived")).toMatchObject({ result: "unchanged" });
    expect(await set("open")).toMatchObject({
      result: "updated",
      job: { status: "open" },
    });
    expect(await jobRow(id)).toMatchObject({ status: "open" });
  });

  it("refuses to un-archive a job of a customer deactivated while it held only archived jobs", async () => {
    const admin = await member(owner, w, "a", "admin");
    const id = await jobIn("a", { status: "archived" });
    expect(
      await appCaller(app, admin.who).customer.deactivate({ customerId: w.a.customerId }),
    ).toMatchObject({ result: "updated" });
    expect(await job(admin.who).setStatus({ jobId: id, status: "complete" })).toEqual({
      result: "rejected",
      code: "customer_inactive",
    });
    expect(await jobRow(id)).toMatchObject({ status: "archived" });
  });
});

describe("gates and targets", () => {
  it("is admin only and answers FORBIDDEN for a missing or foreign job or customer", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    const id = await jobIn("a");
    const jobB = await jobIn("b");
    const facts = { customerId: w.a.customerId, name: "X" };
    for (const call of [
      () => job(worker.who).create(facts),
      () => job(worker.who).update({ jobId: id, ...facts }),
      () => job(worker.who).setStatus({ jobId: id, status: "complete" }),
    ]) {
      expect(await outcome(call())).toBe("FORBIDDEN");
    }
    expect(await outcome(job(null).create(facts))).toBe("UNAUTHORIZED");
    for (const jobId of [jobB, crypto.randomUUID()]) {
      expect(await outcome(job(admin.who).update({ jobId, ...facts }))).toBe("FORBIDDEN");
      expect(await outcome(job(admin.who).setStatus({ jobId, status: "complete" }))).toBe(
        "FORBIDDEN",
      );
    }
    for (const customerId of [w.b.customerId, crypto.randomUUID()]) {
      expect(await outcome(job(admin.who).create({ customerId, name: "X" }))).toBe(
        "FORBIDDEN",
      );
      expect(
        await outcome(job(admin.who).update({ jobId: id, customerId, name: "X" })),
      ).toBe("FORBIDDEN");
    }
    expect(await jobRow(jobB)).toMatchObject({ status: "open" });
    expect(await jobRow(id)).toMatchObject({ status: "open", name: "Job" });
  });

  it("re-reads the caller under lock: a deactivation committed while it waited refuses", async () => {
    const admin = await member(owner, w, "a", "admin");
    const id = await jobIn("a");
    let result!: Promise<string>;
    await owner.transaction(async (tx) => {
      await tx.execute(sql`select 1 from jobs where id = ${id} for update`);
      result = outcome(job(admin.who).setStatus({ jobId: id, status: "complete" }));
      await waitForLockWait(owner, '%from "jobs"%for no key update%');
      await tx.execute(
        sql`update users set deactivated_at = now() where id = ${admin.id}`,
      );
    });
    expect(await result).toBe("UNAUTHORIZED");
    expect(await jobRow(id)).toMatchObject({ status: "open" });
  });
});
