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
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { jobAssignments } from "@trader/db/schema";

import { createContext, type Tx } from "../../src/core/context";
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
  "labor.hours": 9,
  "labor.ledger": 9,
  "assignment.week": 9,
  "company.get": 7,
} as const;
const WRITES = {
  "me.update": 7,
  "job.update": 10,
  "assignment.create": 12,
  "assignment.moveToday": 14,
  "sync.push": 18,
  "demo.signIn": 0,
} as const;

const callerOf = createCallerFactory(appRouter);
type Api = ReturnType<typeof callerOf>;

function counter(tx: Tx, who: unknown) {
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
    }),
  );
  // The statements of one call, which must succeed.
  return async (call: (api: Api) => Promise<unknown>) => {
    await call(api);
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

// A company with an admin, a worker on today's shift, two jobs and a day of history.
async function world(tx: Tx): Promise<World> {
  const d = await workDayIn(tx);
  const admin = await boundIn(tx, d.companyId, "admin");
  const worker = await boundIn(tx, d.companyId, "worker");
  const today = workDate(new Date(), NY);
  await tx.insert(jobAssignments).values({
    id: uuidv7(),
    companyId: d.companyId,
    userId: worker.id,
    jobId: d.J,
    workDate: today,
    expectedStart: "00:00",
    expectedEnd: "23:59",
  });
  await history(tx, d, [worker.id, d.w1]);
  return { ...d, admin, worker, today };
}

// A finished day yesterday for each worker: what grows with time.
async function history(tx: Tx, d: WorkDay, workers: string[]) {
  const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  for (const worker of workers) {
    await eventIn(tx, d, { worker, job: d.J, type: "started", client: `${y}T13:00:00Z` });
    await eventIn(tx, d, { worker, job: d.J, type: "ended", client: `${y}T21:00:00Z` });
  }
}

// More of everything the reads walk: workers, jobs and their history.
async function grow(tx: Tx, w: World) {
  await tx.execute(sql`reset role`);
  const more: string[] = [];
  for (let i = 0; i < 4; i++) more.push((await boundIn(tx, w.companyId, "worker")).id);
  await history(tx, w, [...more, w.w2]);
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
  "labor.hours": (api) => api.labor.hours({ from: w.today, to: w.today }),
  "labor.ledger": (api) =>
    api.labor.ledger({ workerId: w.worker.id, from: w.today, to: w.today }),
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
      out["sync.push"] = await asWorker((api) =>
        api.sync.push({
          protocolVersion: 1,
          deviceNow: new Date(),
          records: [
            {
              id: uuidv7(),
              kind: "labor_event",
              schemaVersion: 1,
              payload: {
                workerId: w.worker.id,
                jobId: w.K,
                type: "started",
                clientTimestamp: new Date(),
                location: null,
                timeSetByUser: false,
                capturedOffline: false,
              },
            },
          ],
        }),
      );
      // No Demo door on this host: refused as data, before any statement.
      out["demo.signIn"] = await counter(
        tx,
        null,
      )((api) => api.demo.signIn({ phone: "+14015550100", code: "000000" }));
      expect(out).toEqual(WRITES);
    });
  });
});
