// Statement budgets: the exact number of statements each phone procedure and each hot office
// read sends (the meter, @trader/db meter.ts), and, for every read, the same number after
// the company has grown. A statement added to one of these turns this red; a budget raised
// on purpose says why in its commit. Time is not measured here (section H of the backend
// plan): a count is exact on every machine.
//
// Counted inside a rolled-back owner transaction, as every rolled-back suite calls: the
// procedure's own transaction is a savepoint, so `savepoint` and `release` stand where a
// deployed call sends `begin` and `commit`, one for one. The role check runs once per pool
// in production; it is taken first here so that no budget carries it.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  companies,
  customers,
  invoiceLineItems,
  invoices,
  jobAssignments,
  jobs,
  users,
} from "@trader/db/schema";

import { PHONE_PROCEDURES } from "../../src/contract";
import { createContext, type Tx } from "../../src/core/context";
import type { DemoDoor } from "../../src/core/context";
import { localDirectory } from "../../src/core/identity";
import type { CallLine } from "../../src/core/observe";
import { createCallerFactory, runtimeRoleChecked } from "../../src/core/trpc";
import { workDate } from "../../src/labor/work-date";
import { appRouter } from "../../src/router";
import {
  REQUEST_ID,
  asTenant,
  boundIn,
  eventIn,
  ownerDb,
  quietReporter,
  rolledBack,
  txAsDb,
  uuidv7,
  workDayIn,
  type WorkDay,
} from "../helpers";

const owner = ownerDb();
afterAll(async () => {
  await owner.$client.end();
});

const NY = "America/New_York";

// The budgets. Phone procedures first (contract/phone.ts), then the hot office reads.
const READS = {
  "me.get": 6,
  "overview.today": 14,
  "roster.list": 9,
  "status.get": 0,
  "sync.pull": 13,
  "job.list": 10,
  "job.read": 14,
  "customer.list": 7,
  "invoice.list": 8,
  "invoice.totals": 9,
  "labor.hours": 11,
  "labor.ledger": 11,
  "assignment.week": 9,
  "company.get": 7,
} as const;
const WRITES = {
  "me.update": 7,
  "job.update": 10,
  "job.setLocation": 10,
  "assignment.create": 12,
  "assignment.moveToday": 14,
  "sync.push": 18,
  // Each further record adds 16: a push is one transaction per record, by design (sync/push.ts).
  "sync.push, two records": 34,
  "demo.signIn": 0,
  "demo.signIn, admitted": 4,
} as const;

const callerOf = createCallerFactory(appRouter);
type Api = ReturnType<typeof callerOf>;

function counter(tx: Tx, who: unknown, demo: DemoDoor | null = null) {
  const lines: CallLine[] = [];
  const api: Api = callerOf(
    createContext({
      db: txAsDb(tx),
      identity: who,
      directory: localDirectory,
      reporter: quietReporter,
      requestId: REQUEST_ID,
      waits: "inherit",
      observe: (line) => lines.push(line),
      demo,
    }),
  );
  // The statements of one call, which must succeed; `answer`, when given, is what it must
  // answer, so a budget never stands for a path the call did not take.
  return async (call: (api: Api) => Promise<unknown>, answer?: unknown) => {
    const value = await call(api);
    if (answer !== undefined) expect(value).toMatchObject(answer as object);
    const line = lines.at(-1)!;
    expect([line.path, line.ok]).toEqual([line.path, true]);
    return line.statements;
  };
}

type World = WorkDay & {
  admin: Awaited<ReturnType<typeof boundIn>>;
  worker: Awaited<ReturnType<typeof boundIn>>;
  today: string;
};

// A company with an admin, a worker on today's shift, two jobs, a draft invoice and a day of
// history.
async function world(tx: Tx): Promise<World> {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const worker = await boundIn(tx, d.companyId, "worker");
  const today = workDate(new Date(), NY);
  await shift(tx, d.companyId, worker.id, d.J, today);
  await history(tx, d, [worker.id, d.w1], 1);
  await invoiceIn(tx, d.companyId, d.customerId, d.J, 1);
  return { ...d, admin, worker, today };
}

const shift = (tx: Tx, companyId: string, userId: string, jobId: string, day: string) =>
  tx.insert(jobAssignments).values({
    id: uuidv7(),
    companyId,
    userId,
    jobId,
    workDate: day,
    expectedStart: "00:00",
    expectedEnd: "23:59",
  });

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// A finished day, `ago` days back, for each worker: what grows with time.
async function history(tx: Tx, d: WorkDay, workers: string[], ago: number) {
  const y = daysAgo(ago);
  for (const worker of workers) {
    await eventIn(tx, d, { worker, job: d.J, type: "started", client: `${y}T13:00:00Z` });
    await eventIn(tx, d, { worker, job: d.J, type: "ended", client: `${y}T21:00:00Z` });
  }
}

// A draft invoice for the job with `lines` lines.
async function invoiceIn(
  tx: Tx,
  companyId: string,
  customerId: string,
  jobId: string,
  lines: number,
) {
  const [row] = await tx
    .insert(invoices)
    .values({ companyId, customerId, jobId, currency: "USD", taxCents: 0 })
    .returning({ id: invoices.id });
  for (let position = 1; position <= lines; position++) {
    await tx.insert(invoiceLineItems).values({
      companyId,
      invoiceId: row!.id,
      currency: "USD",
      position,
      description: `Line ${position}`,
      quantity: "1",
      unitPriceCents: 1000,
      amountCents: 1000,
    });
  }
}

// More of everything each read walks: workers on today's shifts and their history, the
// worker's own earlier day, customers, jobs and invoices.
async function grow(tx: Tx, w: World) {
  await tx.execute(sql`reset role`);
  const more: string[] = [];
  for (let i = 0; i < 4; i++) more.push((await boundIn(tx, w.companyId, "worker")).id);
  for (const id of more) await shift(tx, w.companyId, id, w.K, w.today);
  await history(tx, w, [...more, w.w2], 1);
  await history(tx, w, [w.worker.id], 2);
  for (let i = 0; i < 3; i++) {
    const [c] = await tx
      .insert(customers)
      .values({ companyId: w.companyId, name: `Customer ${i}` })
      .returning({ id: customers.id });
    const [j] = await tx
      .insert(jobs)
      .values({ companyId: w.companyId, customerId: c!.id, name: `Job ${i}` })
      .returning({ id: jobs.id });
    await invoiceIn(tx, w.companyId, c!.id, j!.id, 2);
    await invoiceIn(tx, w.companyId, w.customerId, w.J, 2);
  }
  await asTenant(tx, w.companyId);
}

const reads = (w: World): Record<keyof typeof READS, (api: Api) => Promise<unknown>> => ({
  "me.get": (api) => api.me.get(),
  "overview.today": (api) => api.overview.today(),
  "roster.list": (api) => api.roster.list(),
  "status.get": (api) =>
    api.status.get({ protocolVersion: 1, platform: "ios", build: 1 }),
  "sync.pull": (api) => api.sync.pull({ protocolVersion: 1 }),
  "job.list": (api) => api.job.list(),
  "job.read": (api) => api.job.read({ jobId: w.J }),
  "customer.list": (api) => api.customer.list(),
  "invoice.list": (api) => api.invoice.list(),
  "invoice.totals": (api) => api.invoice.totals(),
  "labor.hours": (api) => api.labor.hours({ from: daysAgo(2), to: w.today }),
  "labor.ledger": (api) =>
    api.labor.ledger({ workerId: w.worker.id, from: daysAgo(2), to: w.today }),
  "assignment.week": (api) => api.assignment.week({ weekStart: mondayOf(w.today) }),
  "company.get": (api) => api.company.get(),
});

function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Who calls each: the phone's own reads as the worker, everything else as the admin.
const AS_WORKER = new Set(["me.get", "sync.pull", "status.get"]);

describe("statement budgets", () => {
  it("has a budget for every phone procedure", () => {
    const budgeted = new Set([...Object.keys(READS), ...Object.keys(WRITES)]);
    expect(PHONE_PROCEDURES.filter((p) => !budgeted.has(p))).toEqual([]);
  });

  it("holds every read to its budget, at two sizes of company", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await asTenant(tx, w.companyId);
      await runtimeRoleChecked(txAsDb(tx));
      const asWorker = counter(tx, w.worker.who);
      const asAdmin = counter(tx, w.admin.who);
      const measure = async () => {
        const out: Record<string, number> = {};
        for (const [path, call] of Object.entries(reads(w))) {
          out[path] = await (AS_WORKER.has(path) ? asWorker : asAdmin)(call);
        }
        return out;
      };
      const small = await measure();
      await grow(tx, w);
      const large = await measure();
      expect(small).toEqual(READS);
      expect(large).toEqual(READS);
    });
  });

  it("holds every phone write to its budget", async () => {
    await rolledBack(owner, async (tx) => {
      const w = await world(tx);
      await asTenant(tx, w.companyId);
      await runtimeRoleChecked(txAsDb(tx));
      const asWorker = counter(tx, w.worker.who);
      const asAdmin = counter(tx, w.admin.who);
      const out: Record<string, number> = {};
      out["me.update"] = await asWorker((api) =>
        api.me.update({ name: "Renamed", phone: null }),
      );
      out["job.update"] = await asAdmin((api) =>
        api.job.update({ jobId: w.K, customerId: w.customerId, name: "K renamed" }),
      );
      out["job.setLocation"] = await asAdmin((api) =>
        api.job.setLocation({
          jobId: w.K,
          location: { lat: 41.8, lng: -71.4, radiusM: 150 },
        }),
      );
      out["assignment.create"] = await asAdmin((api) =>
        api.assignment.create({
          userId: w.w1,
          jobId: w.K,
          expectedStart: "07:00",
          expectedEnd: "15:00",
          days: [{ id: uuidv7(), workDate: w.today }],
        }),
      );
      out["assignment.moveToday"] = await asAdmin((api) =>
        api.assignment.moveToday({
          id: uuidv7(),
          userId: w.worker.id,
          jobId: w.K,
          at: "12:00",
          expectedEnd: "16:00",
        }),
      );
      const event = (type: "started" | "paused" | "resumed") => ({
        id: uuidv7(),
        kind: "labor_event" as const,
        schemaVersion: 1,
        payload: {
          workerId: w.worker.id,
          jobId: w.K,
          type,
          clientTimestamp: new Date(),
          location: null,
          timeSetByUser: false,
          capturedOffline: false,
        },
      });
      const push = (records: ReturnType<typeof event>[]) => (api: Api) =>
        api.sync.push({ protocolVersion: 1, deviceNow: new Date(), records });
      const accepted = (n: number) => ({
        results: Array.from({ length: n }, () => ({ result: "accepted" })),
      });
      out["sync.push"] = await asWorker(push([event("started")]), accepted(1));
      // A second record's own cost: the difference is what each further record adds.
      out["sync.push, two records"] = await asWorker(
        push([event("paused"), event("resumed")]),
        accepted(2),
      );
      // No Demo door on this host: refused as data, before any statement.
      out["demo.signIn"] = await counter(tx, null)(
        (api) => api.demo.signIn({ phone: "+14015550100", code: "000000" }),
        { result: "refused" },
      );
      // The door's whole path, up to the provider's ticket: a Demo person's number.
      await tx.execute(sql`reset role`);
      await tx
        .update(users)
        .set({ signInPhone: "+14015550100" })
        .where(eq(users.id, w.worker.id));
      await tx.update(companies).set({ demo: true }).where(eq(companies.id, w.companyId));
      await asTenant(tx, w.companyId);
      const door: DemoDoor = {
        code: "demo-code",
        companyId: w.companyId,
        ticket: async () => "ticket",
      };
      out["demo.signIn, admitted"] = await counter(
        tx,
        null,
        door,
      )((api) => api.demo.signIn({ phone: "+14015550100", code: "demo-code" }), {
        result: "ticket",
        ticket: "ticket",
      });
      expect(out).toEqual(WRITES);
    });
  });
});
