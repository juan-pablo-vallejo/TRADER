// TASKS:46: customer.list, create, update, deactivate, reactivate — every customer of the
// caller's company with its unarchived-job count; blank optional text stored NULL; a customer
// with a job not yet archived is never deactivated, judged under its row lock; admin only, a
// missing or foreign id one FORBIDDEN; a caller deactivated mid-call UNAUTHORIZED.
import { customers, jobs } from "@trader/db/schema";
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

const customer = (who: unknown) => appCaller(app, who).customer;

type CreateInput = Parameters<ReturnType<typeof customer>["create"]>[0];

async function job(
  companyId: string,
  customerId: string,
  status: "open" | "complete" | "archived",
) {
  const [row] = await owner
    .insert(jobs)
    .values({ companyId, customerId, name: `Job ${status}`, status })
    .returning({ id: jobs.id });
  return row!.id;
}

// A call that waits on `lock` (held by the owner) while the caller is deactivated and the lock
// released: the writer re-reads the caller under its own lock and refuses.
async function deactivatedMidCall(
  adminId: string,
  lock: ReturnType<typeof sql>,
  queued: string,
  call: () => Promise<unknown>,
) {
  let result!: Promise<string>;
  await owner.transaction(async (tx) => {
    await tx.execute(lock);
    result = outcome(call());
    await waitForLockWait(owner, queued);
    await tx.execute(sql`update users set deactivated_at = now() where id = ${adminId}`);
  });
  return result;
}

describe("customer.list", () => {
  it("lists the company's customers by name with unarchived-job counts, no other company's", async () => {
    const admin = await member(owner, w, "a", "admin");
    await job(w.a.companyId, w.a.customerId, "open");
    await job(w.a.companyId, w.a.customerId, "complete");
    await job(w.a.companyId, w.a.customerId, "archived");
    const [second] = await owner
      .insert(customers)
      .values({ companyId: w.a.companyId, name: "aardvark", deactivatedAt: new Date() })
      .returning({ id: customers.id });
    const rows = await customer(admin.who).list();
    expect(rows.map((r) => r.id)).toEqual([second!.id, w.a.customerId]);
    expect(rows[1]).toStrictEqual({
      id: w.a.customerId,
      name: "Customer a",
      address: null,
      phone: null,
      email: null,
      notes: null,
      deactivatedAt: null,
      unarchivedJobs: 2,
    });
    expect(rows[0]!.deactivatedAt).toBeInstanceOf(Date);
    expect(rows.map((r) => r.id)).not.toContain(w.b.customerId);
  });

  it("answers 401, 403 and 200 over HTTP", async () => {
    const send = async (who: unknown) => {
      const r = await http(app, who, [{ path: "customer.list" }], { router: appRouter });
      return { status: r.status, ...failure(r.results[0]) };
    };
    expect(await send(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    const foreman = await member(owner, w, "a", "foreman");
    expect(await send(foreman.who)).toMatchObject({ status: 403, code: "FORBIDDEN" });
    const admin = await member(owner, w, "a", "admin");
    expect((await send(admin.who)).status).toBe(200);
  });
});

describe("customer.create and customer.update", () => {
  it("creates with trimmed text, blank optional text as NULL, and lists it", async () => {
    const admin = await member(owner, w, "a", "admin");
    const answer = await customer(admin.who).create({
      name: "  Smith Residence ",
      address: "   ",
      phone: "",
      email: "",
      notes: " keys under the mat ",
    });
    expect(answer).toMatchObject({
      result: "created",
      customer: {
        name: "Smith Residence",
        address: null,
        phone: null,
        email: null,
        notes: "keys under the mat",
        deactivatedAt: null,
        unarchivedJobs: 0,
      },
    });
    const [row] = await owner
      .select({ companyId: customers.companyId })
      .from(customers)
      .where(eq(customers.id, answer.customer.id));
    expect(row).toEqual({ companyId: w.a.companyId });
    expect((await customer(admin.who).list()).map((c) => c.id)).toContain(
      answer.customer.id,
    );
  });

  it("refuses a blank name, a bad email or an unknown field with BAD_REQUEST", async () => {
    const admin = await member(owner, w, "a", "admin");
    for (const input of [
      { name: "  " },
      { name: "X", email: "not an email" },
      { name: "X", companyId: w.b.companyId },
    ]) {
      expect(await outcome(customer(admin.who).create(input as CreateInput))).toBe(
        "BAD_REQUEST",
      );
    }
  });

  it("replaces the record whole, on a deactivated customer too", async () => {
    const admin = await member(owner, w, "a", "admin");
    await owner
      .update(customers)
      .set({ deactivatedAt: new Date(), notes: "old" })
      .where(eq(customers.id, w.a.customerId));
    const answer = await customer(admin.who).update({
      customerId: w.a.customerId,
      name: "Renamed",
      email: "a@example.test",
      phone: "401-555-0100",
    });
    expect(answer).toMatchObject({
      result: "updated",
      customer: { name: "Renamed", email: "a@example.test", address: null, notes: null },
    });
    expect(answer.customer.deactivatedAt).toBeInstanceOf(Date);
  });
});

describe("customer.deactivate and customer.reactivate", () => {
  it("refuses while any job is not archived, counting complete ones, then deactivates", async () => {
    const admin = await member(owner, w, "a", "admin");
    const open = await job(w.a.companyId, w.a.customerId, "open");
    const complete = await job(w.a.companyId, w.a.customerId, "complete");
    await job(w.a.companyId, w.a.customerId, "archived");
    const target = { customerId: w.a.customerId };
    expect(await customer(admin.who).deactivate(target)).toEqual({
      result: "rejected",
      code: "jobs_unarchived",
      unarchivedJobs: 2,
    });
    await owner.update(jobs).set({ status: "archived" }).where(eq(jobs.id, open));
    expect(await customer(admin.who).deactivate(target)).toMatchObject({
      result: "rejected",
      unarchivedJobs: 1,
    });
    await owner.update(jobs).set({ status: "archived" }).where(eq(jobs.id, complete));
    const off = await customer(admin.who).deactivate(target);
    expect(off).toMatchObject({ result: "updated", customer: { id: w.a.customerId } });
    if (off.result !== "updated") throw new Error("unreachable");
    expect(off.customer.deactivatedAt).toBeInstanceOf(Date);
    expect(await customer(admin.who).deactivate(target)).toMatchObject({
      result: "unchanged",
    });
    expect(await customer(admin.who).reactivate(target)).toMatchObject({
      result: "updated",
      customer: { deactivatedAt: null },
    });
    expect(await customer(admin.who).reactivate(target)).toMatchObject({
      result: "unchanged",
    });
  });

  it("is admin only and answers FORBIDDEN for a missing or foreign target", async () => {
    const admin = await member(owner, w, "a", "admin");
    const worker = await member(owner, w, "a", "worker");
    const fields = { name: "X" };
    for (const call of [
      () => customer(worker.who).create(fields),
      () => customer(worker.who).update({ customerId: w.a.customerId, ...fields }),
      () => customer(worker.who).deactivate({ customerId: w.a.customerId }),
      () => customer(worker.who).reactivate({ customerId: w.a.customerId }),
    ]) {
      expect(await outcome(call())).toBe("FORBIDDEN");
    }
    expect(await outcome(customer(null).create(fields))).toBe("UNAUTHORIZED");
    for (const customerId of [w.b.customerId, crypto.randomUUID()]) {
      expect(await outcome(customer(admin.who).update({ customerId, ...fields }))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(customer(admin.who).deactivate({ customerId }))).toBe(
        "FORBIDDEN",
      );
      expect(await outcome(customer(admin.who).reactivate({ customerId }))).toBe(
        "FORBIDDEN",
      );
    }
    const [b] = await owner
      .select({ name: customers.name, deactivatedAt: customers.deactivatedAt })
      .from(customers)
      .where(eq(customers.id, w.b.customerId));
    expect(b).toEqual({ name: "Customer b", deactivatedAt: null });
  });

  it("re-reads the caller under lock: a deactivation committed while it waited refuses", async () => {
    const admin = await member(owner, w, "a", "admin");
    // create's only lock is the caller's own row; the others queue on the customer first.
    expect(
      await deactivatedMidCall(
        admin.id,
        sql`select 1 from users where id = ${admin.id} for update`,
        '%from "users"%for share%',
        () => customer(admin.who).create({ name: "Late" }),
      ),
    ).toBe("UNAUTHORIZED");
    expect(await owner.$count(customers, eq(customers.name, "Late"))).toBe(0);
    const again = await member(owner, w, "a", "admin", { label: "again" });
    expect(
      await deactivatedMidCall(
        again.id,
        sql`select 1 from customers where id = ${w.a.customerId} for update`,
        '%from "customers"%for no key update%',
        () => customer(again.who).deactivate({ customerId: w.a.customerId }),
      ),
    ).toBe("UNAUTHORIZED");
    const [row] = await owner
      .select({ deactivatedAt: customers.deactivatedAt })
      .from(customers)
      .where(eq(customers.id, w.a.customerId));
    expect(row).toEqual({ deactivatedAt: null });
  });
});
