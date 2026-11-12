// Shared by the API tests. Unlike the schema tests, nothing here can run in a rolled-back
// transaction: the code under test opens its own. Fixtures are therefore committed by the
// owner, under company names with a random suffix, and deleted afterwards. No fixture writes
// a work_session_event, so the deletes are always allowed. Procedures that write append-only
// rows — labor, closeouts, and every audited write (core/audit.ts) — run through the
// rolled-back calls further down or in a disposable database instead.
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createDb, type Db } from "@trader/db";
import {
  approvals,
  auditLog,
  companies,
  crewMembers,
  crews,
  customers,
  jobs,
  materialCorrections,
  materials,
  payRates,
  jobAssignments,
  syncDiagnostics,
  users,
  workSessionEvents,
} from "@trader/db/schema";
import type { AnyRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { asc, DrizzleQueryError, eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import superjson from "superjson";
import { z } from "zod";

import { createContext, type Tx } from "../src/core/context";
import type { VerifiedIdentity } from "../src/core/identity";
import {
  reportingOnError,
  type ErrorReport,
  type ErrorReporter,
} from "../src/core/report";
import type { AppUser } from "../src/core/resolve-user";
import type { ApprovalReason } from "../src/sync/reasons";
import { appRouter } from "../src/router";
import {
  createCallerFactory,
  protectedProcedure,
  roleProcedure,
  router,
} from "../src/core/trpc";

// The owner: writes fixtures and reads them back past RLS.
export const ownerDb = () => createDb();

// The runtime role as tests can have it. Production logs in as trader_app (guard.ts); tests
// log in as the owner, and every connection the pool opens starts its session as trader_app
// through the startup parameter `role`. Set on the pool's options before its first connect,
// which avoids a direct `pg` dependency here. `max` 1 makes the pool reuse one connection.
export function appDb(opts: { max?: number } = {}): Db {
  const db = createDb();
  db.$client.options.options = "-c role=trader_app";
  if (opts.max !== undefined) db.$client.options.max = opts.max;
  return db;
}

// A request id for callers that are not HTTP requests: the context requires one.
export const REQUEST_ID = "00000000-0000-4000-8000-000000000000";

// Reporters (report.ts): one that drops every event, one that keeps them, one that fails.
export const quietReporter: ErrorReporter = { report() {} };
export function recordingReporter() {
  const events: ErrorReport[] = [];
  const reporter: ErrorReporter = {
    report(event) {
      events.push(event);
    },
  };
  return { reporter, events };
}
export const throwingReporter: ErrorReporter = {
  report() {
    throw new Error("reporter down");
  },
};
export const rejectingReporter: ErrorReporter = {
  report: () => Promise.reject(new Error("reporter down")),
};

export const identity = (subject: string, email: string): VerifiedIdentity => ({
  subject,
  email,
  emailVerified: true,
});

export type World = Awaited<ReturnType<typeof world>>;

// Two companies, each with a bound user, an unbound invitation and a customer. Emails and
// subjects carry the run's suffix, so concurrent runs never meet.
export async function world(owner: Db) {
  const run = crypto.randomUUID().slice(0, 8);
  const make = async (label: string) => {
    const [c] = await owner
      .insert(companies)
      .values({ name: `API Co ${label} ${run}`, timezone: "America/New_York" })
      .returning({ id: companies.id });
    const companyId = c!.id;
    const [bound] = await owner
      .insert(users)
      .values({
        companyId,
        email: `bound-${label}-${run}@co.test`,
        name: `Bound ${label}`,
        identitySubject: `sub-${label}-${run}`,
      })
      .returning({ id: users.id });
    const [invite] = await owner
      .insert(users)
      .values({
        companyId,
        email: `invite-${label}-${run}@co.test`,
        name: `Invite ${label}`,
      })
      .returning({ id: users.id });
    const [customer] = await owner
      .insert(customers)
      .values({ companyId, name: `Customer ${label}` })
      .returning({ id: customers.id });
    return {
      companyId,
      boundId: bound!.id,
      boundSubject: `sub-${label}-${run}`,
      boundEmail: `bound-${label}-${run}@co.test`,
      inviteId: invite!.id,
      inviteEmail: `invite-${label}-${run}@co.test`,
      customerId: customer!.id,
    };
  };
  const a = await make("a");
  const b = await make("b");
  // In reference order, as committedCrewDay deletes: a test may have written any of these.
  const cleanup = async () => {
    const ids = [a.companyId, b.companyId];
    await owner.delete(syncDiagnostics).where(inArray(syncDiagnostics.companyId, ids));
    await owner.delete(jobAssignments).where(inArray(jobAssignments.companyId, ids));
    await owner.delete(crewMembers).where(inArray(crewMembers.companyId, ids));
    await owner.delete(jobs).where(inArray(jobs.companyId, ids));
    await owner.delete(crews).where(inArray(crews.companyId, ids));
    await owner.delete(customers).where(inArray(customers.companyId, ids));
    await owner.delete(payRates).where(inArray(payRates.companyId, ids));
    await owner.delete(users).where(inArray(users.companyId, ids));
    await owner.delete(companies).where(inArray(companies.id, ids));
  };
  return { run, a, b, cleanup };
}

// A bound user of the given role in one of the world's companies, committed by the owner and
// removed by the world's cleanup with the rest of its company.
export async function member(
  owner: Db,
  w: World,
  company: "a" | "b",
  role: AppUser["role"],
  // `label` tells two members of one role and state in one company apart: the tag is the
  // email, unique per company.
  opts: { deactivated?: boolean; label?: string } = {},
) {
  const label = opts.label === undefined ? "" : `-${opts.label}`;
  const tag = `${role}-${opts.deactivated ? "off" : "on"}-${company}${label}-${w.run}`;
  const [row] = await owner
    .insert(users)
    .values({
      companyId: w[company].companyId,
      email: `${tag}@co.test`,
      name: `Member ${tag}`,
      role,
      identitySubject: `sub-${tag}`,
      deactivatedAt: opts.deactivated ? new Date() : null,
    })
    .returning({ id: users.id });
  return { id: row!.id, who: identity(`sub-${tag}`, `${tag}@co.test`) };
}

// Every column, as the owner sees it, for before/after comparisons.
export async function userRow(owner: Db, id: string) {
  const { rows } = await owner.execute(sql`select * from users where id = ${id}`);
  return rows[0];
}

export async function userCount(owner: Db, companyIds: string[]) {
  return owner.$count(users, inArray(users.companyId, companyIds));
}

export async function customerNames(owner: Db, companyId: string) {
  const rows = await owner
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  return rows.map((r) => r.name).sort();
}

// Resolves once `n` backends wait on a lock (`wait_event_type = 'Lock'`) while running a
// statement matching `queryLike`, optionally of one `wait_event` ('advisory' for an advisory
// lock; 'transactionid' or 'tuple' for a row): the point at which a test holding the lock can
// release it and know the waiter is past every earlier statement.
export async function waitForLockWait(
  owner: Db,
  queryLike: string,
  opts: { n?: number; waitEvent?: string } = {},
) {
  const n = opts.n ?? 1;
  for (let i = 0; i < 200; i++) {
    const { rows } = await owner.execute<{ blocked: number }>(sql`
      select count(*)::int as blocked from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
        and (${opts.waitEvent ?? null}::text is null or wait_event = ${opts.waitEvent ?? null})
        and query ilike ${queryLike}
    `);
    if ((rows[0]?.blocked ?? 0) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected ${n} backends waiting on a lock in ${queryLike}`);
}

// Resolves once `n` backends are blocked on a lock inside an UPDATE of users: the point at
// which a test holding a row lock can release it and know both requests race.
export const waitForBlockedUpdates = (owner: Db, n: number) =>
  waitForLockWait(owner, 'update "users"%', { n });

// Test-only procedures, built from the real protectedProcedure, that look inside the
// transaction a protected call runs in.
const probe = router({
  inside: protectedProcedure.query(async ({ ctx }) => {
    const { rows } = await ctx.tx.execute<{
      company: string | null;
      subject: string | null;
      email: string | null;
      txid: string;
    }>(sql`
      select app_company_id()::text as company, app_identity_subject() as subject,
        app_identity_email() as email, txid_current()::text as txid
    `);
    const visible = await ctx.tx.select({ id: customers.id }).from(customers);
    return {
      ...rows[0]!,
      customers: visible.map((c) => c.id),
      user: ctx.user,
      keys: Object.keys(ctx).sort(),
      dbIsUndefined: ctx.db === undefined,
      identityIsUndefined: ctx.identity === undefined,
    };
  }),
  customer: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) =>
      ctx.tx.select().from(customers).where(eq(customers.id, input.id)),
    ),
  write: protectedProcedure
    .input(z.object({ name: z.string(), fail: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx
        .insert(customers)
        .values({ companyId: ctx.user.companyId, name: input.name });
      if (input.fail) throw new Error("procedure failed after its write");
      return "written";
    }),
  divideByZero: protectedProcedure.query(async ({ ctx }) => {
    await ctx.tx.execute(sql`select 1 / 0`);
    return "unreachable";
  }),
});

// Test-only role gates, built from the real roleProcedure: one per admitted set the matrix
// covers. Each reports what the call ran as.
async function report({ ctx }: { ctx: { tx: Tx; user: AppUser } }) {
  const { tx, user } = ctx;
  const { rows } = await tx.execute<{ company: string | null }>(
    sql`select app_company_id()::text as company`,
  );
  const visible = await tx.select({ id: customers.id }).from(customers);
  return {
    role: user.role,
    company: rows[0]!.company,
    customers: visible.map((c) => c.id),
  };
}

const gate = router({
  protected: protectedProcedure.query(report),
  field: roleProcedure("worker", "foreman").query(report),
  foreman: roleProcedure("foreman").query(report),
  admin: roleProcedure("admin").query(report),
  office: roleProcedure("foreman", "admin").query(report),
  // Accepts any input, so a caller can send role and company claims at an admin gate.
  adminLoose: roleProcedure("admin").input(z.looseObject({})).query(report),
  adminWrite: roleProcedure("admin")
    .input(z.object({ name: z.string(), fail: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx
        .insert(customers)
        .values({ companyId: ctx.user.companyId, name: input.name });
      if (input.fail) throw new Error("procedure failed after its write");
      return "written";
    }),
});

export const GATES = ["protected", "field", "foreman", "admin", "office"] as const;

export const testRouter = router({ probe, gate });

export const caller = (db: Db, who: unknown) =>
  createCallerFactory(testRouter)(
    createContext({ db, identity: who, reporter: quietReporter, requestId: REQUEST_ID }),
  );

// The application's own router on committed fixtures: in the shared database only for
// procedures that write nothing append-only (me, the lists), in a disposable one for the
// roster's audited writers. Consumed by the roster, me-update and gate tests.
export const appCaller = (db: Db, who: unknown) =>
  createCallerFactory(appRouter)(
    createContext({ db, identity: who, reporter: quietReporter, requestId: REQUEST_ID }),
  );

// --- Rolled-back calls -----------------------------------------------------------------
// Labor events and closeouts can never be deleted once committed, so a procedure that writes
// them cannot run against the committed fixtures above. Instead the whole call runs inside an
// owner transaction that is always rolled back: fixtures are inserted as the owner, the
// transaction becomes trader_app (SET LOCAL ROLE, as the schema tests do), and the
// transaction itself stands in for the pool, so the protected procedure's db.transaction
// opens a savepoint. Its settings, its role check and its rollback-on-failure all happen
// inside that savepoint; nothing survives the outer rollback. After a successful call its
// tenant setting stays on the outer transaction; after a failed one, it is undone with the
// rest of the savepoint.

const ROLLBACK = Symbol("rollback");

export async function rolledBack(db: Db, body: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await body(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

// Only a transaction's own savepoint API is used through this cast (`transaction`), which a
// Drizzle transaction has with the pool's signature.
export const txAsDb = (tx: Tx) => tx as unknown as Db;

// From here on the transaction runs as the runtime role, as production's pool does.
export async function becomeApp(tx: Tx) {
  await tx.execute(sql`set local role trader_app`);
}

// Fires deferred constraints now: a rolled-back transaction never reaches commit, where they
// would otherwise run.
export async function sealNow(tx: Tx) {
  await tx.execute(sql`set constraints all immediate`);
}

// `waits: "inherit"`: the test's transaction owns its lock and statement timeouts (lockTimeout
// below), and the call inside it must not replace them with the procedure's defaults.
export const callerIn = (tx: Tx, who: unknown) =>
  createCallerFactory(testRouter)(
    createContext({
      db: txAsDb(tx),
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
      waits: "inherit",
    }),
  );

// One company with a bound user of `role` and a customer, inside `tx`. The subject and email
// carry a random suffix: identity_subject is unique across every company.
export async function companyIn(tx: Tx, role: AppUser["role"] = "worker") {
  const run = crypto.randomUUID().slice(0, 8);
  const [c] = await tx
    .insert(companies)
    .values({ name: `Rolled Co ${run}`, timezone: "America/New_York" })
    .returning({ id: companies.id });
  const companyId = c!.id;
  const [u] = await tx
    .insert(users)
    .values({
      companyId,
      email: `rolled-${run}@co.test`,
      name: "Rolled",
      role,
      identitySubject: `sub-rolled-${run}`,
    })
    .returning({ id: users.id });
  const [cu] = await tx
    .insert(customers)
    .values({ companyId, name: "Customer" })
    .returning({ id: customers.id });
  return {
    companyId,
    userId: u!.id,
    customerId: cu!.id,
    who: identity(`sub-rolled-${run}`, `rolled-${run}@co.test`),
  };
}

// What a device does: 48 bits of milliseconds, version 7, variant 10, random. Rows written by
// rolled-back tests still share the database with concurrent suites, so ids are random.
export function uuidv7(ms = Date.now()): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const t = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// A crew's day, inside `tx`: a New York company whose bound foreman runs a crew assigned job
// J, two workers, and job K on no crew. Everything a closeout of J reads.
export async function crewDayIn(tx: Tx) {
  const c = await companyIn(tx, "foreman");
  const worker = async (n: string) =>
    (
      await tx
        .insert(users)
        .values({ companyId: c.companyId, email: `${n}-${uuidv7()}@co.test`, name: n })
        .returning({ id: users.id })
    )[0]!.id;
  const w1 = await worker("w1");
  const w2 = await worker("w2");
  const [crew] = await tx
    .insert(crews)
    .values({ companyId: c.companyId, name: "Crew", foremanUserId: c.userId })
    .returning({ id: crews.id });
  await tx.insert(crewMembers).values(
    [c.userId, w1, w2].map((userId) => ({
      companyId: c.companyId,
      crewId: crew!.id,
      userId,
    })),
  );
  const job = async (name: string, crewId: string | null) =>
    (
      await tx
        .insert(jobs)
        .values({ companyId: c.companyId, customerId: c.customerId, name, crewId })
        .returning({ id: jobs.id })
    )[0]!.id;
  const J = await job("J", crew!.id);
  const K = await job("K", null);
  return { ...c, foremanId: c.userId, crewId: crew!.id, w1, w2, J, K };
}

export type CrewDay = Awaited<ReturnType<typeof crewDayIn>>;

type EventInput = {
  worker: string;
  job: string;
  type: "started" | "paused" | "resumed" | "ended" | "voided";
  client: string;
  // Receipt; defaults to the device time. Stated, so acceptance order is the test's.
  server?: string;
  skewed?: boolean;
  corrects?: string;
  voids?: string;
  // Who recorded it; defaults to the worker.
  initiator?: string;
};

// One ledger row, written as the owner (the API's writers are later lines).
export async function eventIn(tx: Tx, day: CrewDay, e: EventInput): Promise<string> {
  const server = new Date(e.server ?? e.client);
  const id = uuidv7(server.getTime());
  await tx.insert(workSessionEvents).values({
    id,
    companyId: day.companyId,
    workerId: e.worker,
    jobId: e.job,
    type: e.type,
    clientTimestamp: new Date(e.client),
    serverTimestamp: server,
    clockSkewed: e.skewed ?? false,
    clockSkewMs: e.skewed ? 600_000 : 0,
    attestationLevel: "none",
    schemaVersion: 1,
    timeSetByUser: false,
    capturedOffline: false,
    initiatorUserId: e.initiator ?? e.worker,
    voidsEventId: e.voids ?? null,
    correctsEventId: e.corrects ?? null,
  });
  return id;
}

export async function materialIn(
  tx: Tx,
  day: CrewDay,
  job: string,
  loggedAt: string,
  by = day.w1,
  enteredByOffice = false,
) {
  const id = uuidv7();
  await tx.insert(materials).values({
    id,
    companyId: day.companyId,
    jobId: job,
    loggedByUserId: by,
    description: "Eggshell, white",
    quantity: "2.000",
    unit: "gal",
    loggedAt: new Date(loggedAt),
    capturedOffline: false,
    clockSkewed: false,
    clockSkewMs: 0,
    enteredByOffice,
  });
  return id;
}

// The application's own router, called inside a rolled-back transaction.
export const appCallerIn = (tx: Tx, who: unknown) =>
  createCallerFactory(appRouter)(
    createContext({
      db: txAsDb(tx),
      identity: who,
      reporter: quietReporter,
      requestId: REQUEST_ID,
      waits: "inherit",
    }),
  );

// Another bound user in the day's company.
export async function boundIn(
  tx: Tx,
  companyId: string,
  role: AppUser["role"],
  opts: { deactivated?: boolean } = {},
) {
  const tag = `${role}-${uuidv7()}`;
  const [row] = await tx
    .insert(users)
    .values({
      companyId,
      email: `${tag}@co.test`,
      name: tag,
      role,
      identitySubject: `sub-${tag}`,
      deactivatedAt: opts.deactivated ? new Date() : null,
    })
    .returning({ id: users.id });
  return { id: row!.id, who: identity(`sub-${tag}`, `${tag}@co.test`) };
}

// A crew's day committed by the owner, for tests that need two connections to see the same
// rows. Nothing appended-only is ever committed against it, so cleanup can remove it all.
export async function committedCrewDay(owner: Db) {
  const day = await owner.transaction((tx) => crewDayIn(tx));
  const cleanup = async () => {
    const id = day.companyId;
    await owner.delete(syncDiagnostics).where(eq(syncDiagnostics.companyId, id));
    await owner.delete(jobAssignments).where(eq(jobAssignments.companyId, id));
    await owner.delete(materials).where(eq(materials.companyId, id));
    await owner.delete(jobs).where(eq(jobs.companyId, id));
    await owner.delete(crewMembers).where(eq(crewMembers.companyId, id));
    await owner.delete(crews).where(eq(crews.companyId, id));
    await owner.delete(customers).where(eq(customers.companyId, id));
    await owner.delete(users).where(eq(users.companyId, id));
    await owner.delete(companies).where(eq(companies.id, id));
  };
  return { day, cleanup };
}

// The runtime role with the day's tenant set, as a protected call runs.
export async function asTenant(tx: Tx, companyId: string) {
  await becomeApp(tx);
  await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
}

export type HttpCall = { path: string; input?: unknown; mutation?: boolean };

// One HTTP request through tRPC's fetch adapter: what the route handler (Stage 4) will do. One
// call is sent unbatched, so `status` is that call's own; several are one batch, whose status
// says nothing about any single result. `identify` turns the request's headers into the
// identity, as an adapter does; by default every request carries `who`.
export async function http(
  db: Db,
  who: unknown,
  calls: HttpCall[],
  opts: {
    headers?: Record<string, string>;
    identify?: (h: Headers) => Promise<unknown>;
    // The reporter goes into the context and, as the route handler will wire it, `onError`.
    reporter?: ErrorReporter;
    router?: AnyRouter;
  } = {},
) {
  const reporter = opts.reporter ?? quietReporter;
  // As the route handler does: one id per HTTP request, shared by its calls and its reports.
  const requestId = randomUUID();
  const batched = calls.length > 1;
  const mutation = calls.some((c) => c.mutation);
  const serialized = batched
    ? Object.fromEntries(calls.map((c, i) => [i, superjson.serialize(c.input ?? null)]))
    : superjson.serialize(calls[0]!.input ?? null);
  const paths = calls.map((c) => c.path).join(",");
  const url = new URL(`http://test/trpc/${paths}${batched ? "?batch=1" : ""}`);
  if (!mutation) url.searchParams.set("input", JSON.stringify(serialized));
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    router: opts.router ?? testRouter,
    onError: reportingOnError(reporter, requestId),
    req: new Request(url, {
      method: mutation ? "POST" : "GET",
      headers: {
        ...opts.headers,
        ...(mutation ? { "content-type": "application/json" } : {}),
      },
      ...(mutation ? { body: JSON.stringify(serialized) } : {}),
    }),
    createContext: async ({ req }) =>
      createContext({
        db,
        identity: opts.identify ? await opts.identify(req.headers) : who,
        reporter,
        requestId,
      }),
  });
  const body = (await response.json()) as HttpResult | HttpResult[];
  return {
    status: response.status,
    results: Array.isArray(body) ? body : [body],
    requestId,
  };
}

export type HttpResult = {
  result?: { data: { json: unknown } };
  error?: {
    json: { message: string; data: { code: string; httpStatus: number; stack?: string } };
  };
};

// A failed result's public face: what a client can see of it.
export const failure = (r: HttpResult | undefined) => ({
  code: r?.error?.json.data.code,
  message: r?.error?.json.message,
  httpStatus: r?.error?.json.data.httpStatus,
});

// The procedure's error code, or "OK".
export async function outcome(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? "THROWN";
  }
}

// Two connections. The holder's transaction stays open until the contender is done, then rolls
// back.
export async function holding(
  db: Db,
  body: (tx: Tx) => Promise<void>,
  contender: () => Promise<void>,
) {
  let release: () => void = () => {};
  const released = new Promise<void>((r) => (release = r));
  let ready: () => void = () => {};
  const held = new Promise<void>((r) => (ready = r));
  let failed: unknown;
  const holder = rolledBack(db, async (tx) => {
    try {
      await body(tx);
    } catch (error) {
      failed = error;
    }
    ready();
    await released;
  });
  await held;
  try {
    if (failed !== undefined) throw failed;
    await contender();
  } finally {
    release();
    await holder;
  }
}

export const lockTimeout = (tx: Tx) => tx.execute(sql`set local lock_timeout = '300ms'`);

// The SQLSTATE somewhere in an error's cause chain.
export function sqlstateOf(error: unknown): string | undefined {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e instanceof DrizzleQueryError) return (e.cause as { code?: string }).code;
  }
  return undefined;
}

// The error a promise rejects with; a resolution fails the test.
export async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error("expected the call to fail");
}

// A worked, ended day on J, 5 October in New York: w1 4 h, w2 8 h.
export const WORKED_DAY = "2026-10-05";
export async function workedDay(tx: Tx, d: CrewDay) {
  const at = (worker: string, start: string, end: string) => [
    { worker, job: d.J, type: "started" as const, client: start },
    { worker, job: d.J, type: "ended" as const, client: end },
  ];
  for (const e of [
    ...at(d.w1, "2026-10-05T12:00:00Z", "2026-10-05T16:00:00Z"),
    ...at(d.w2, "2026-10-05T13:00:00Z", "2026-10-05T21:00:00Z"),
  ]) {
    await eventIn(tx, d, e);
  }
}

// --- Disposable databases ---------------------------------------------------------------
// Rolled-back transactions prove nothing about commits: a savepoint released inside one is not
// a commit, and a failure there cannot be seen from another connection. The real-commit suites
// (sync/push-commit.test.ts) run in a database of their own instead, made by the owner,
// migrated through the whole journal — which also proves a fresh replay on every run — and
// dropped afterwards with everything append-only that was committed in it. The compose and CI
// user is a superuser (MEMORY), so it may CREATE DATABASE; if that ever stops holding, these
// suites fail, never skip.
export async function disposableDb() {
  const name = `trader_t_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = createDb();
  await admin.execute(sql.raw(`create database ${name}`));
  // Compose variables pointed at the new database; a blank DATABASE_URL means unset (env.ts).
  const env = { ...process.env, POSTGRES_DB: name, DATABASE_URL: "" };
  const owner = createDb(env);
  await migrate(owner, {
    migrationsFolder: fileURLToPath(new URL("../../db/migrations", import.meta.url)),
  });
  const pools: Db[] = [owner];
  // The runtime role, as appDb() gives it for the shared database.
  const app = (opts: { max?: number } = {}) => {
    const db = createDb(env);
    db.$client.options.options = "-c role=trader_app";
    if (opts.max !== undefined) db.$client.options.max = opts.max;
    pools.push(db);
    return db;
  };
  // pool.end() resolves before the server's backends have gone; a forced drop would kill them
  // mid-close, and the client would raise an error nothing is listening for. Wait them out.
  const drop = async () => {
    await Promise.all(pools.map((p) => p.$client.end()));
    for (let i = 0; i < 200; i++) {
      const { rows } = await admin.execute<{ n: number }>(
        sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
      );
      if (rows[0]?.n === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await admin.execute(sql.raw(`drop database ${name}`));
    await admin.$client.end();
  };
  return { name, owner, app, drop };
}

// --- Approvals ---------------------------------------------------------------------------

type Subject =
  { eventId: string } | { materialId: string } | { materialCorrectionId: string };

// A pending approval of one subject, written by the owner as its writer would.
export async function pendingApproval(
  tx: Tx,
  companyId: string,
  subject: Subject,
  reasons: ApprovalReason[] = ["offline"],
): Promise<string> {
  const [row] = await tx
    .insert(approvals)
    .values({ companyId, ...subject, reasons })
    .returning({ id: approvals.id });
  return row!.id;
}

// A correction of a late receipt (its after_closeout approval makes it correctable, 0024) with
// its pending approval. Returns both ids.
export async function correctionIn(
  tx: Tx,
  day: CrewDay,
  materialId: string,
  by: string,
  kind: "amend" | "void" = "amend",
  serverTimestamp = new Date(),
) {
  const id = uuidv7(serverTimestamp.getTime());
  await tx.insert(materialCorrections).values({
    id,
    companyId: day.companyId,
    materialId,
    kind,
    description: kind === "amend" ? "Primer, grey" : null,
    quantity: kind === "amend" ? "3.000" : null,
    unit: kind === "amend" ? "gal" : null,
    note: null,
    submittedByUserId: by,
    clientTimestamp: serverTimestamp,
    serverTimestamp,
  });
  const approvalId = await pendingApproval(
    tx,
    day.companyId,
    { materialCorrectionId: id },
    ["corrected"],
  );
  return { correctionId: id, approvalId };
}

// A late receipt: logged, with its pending after_closeout approval.
export async function lateReceiptIn(tx: Tx, day: CrewDay, by = day.w1) {
  const materialId = await materialIn(tx, day, day.J, "2026-10-05T14:00:00Z", by);
  const approvalId = await pendingApproval(tx, day.companyId, { materialId }, [
    "after_closeout",
  ]);
  return { materialId, approvalId };
}

// --- Audit rows --------------------------------------------------------------------------
// audit_log is append-only and references the company and the actor, so a procedure that
// writes it is called only inside a rolled-back transaction or in a disposable database.

const auditColumns = {
  companyId: auditLog.companyId,
  actorUserId: auditLog.actorUserId,
  action: auditLog.action,
  entityTable: auditLog.entityTable,
  entityId: auditLog.entityId,
  before: auditLog.before,
  after: auditLog.after,
};

// A company's audit rows in the order written, as the owner reads them past RLS.
export const auditRows = (owner: Db, companyId: string) =>
  owner
    .select(auditColumns)
    .from(auditLog)
    .where(eq(auditLog.companyId, companyId))
    .orderBy(asc(auditLog.id));

// The same inside a rolled-back transaction, whatever role it runs as: the tenant is set
// first, because a failed call's savepoint undid the one its procedure had set.
export async function auditRowsIn(tx: Tx, companyId: string) {
  await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
  return tx
    .select(auditColumns)
    .from(auditLog)
    .where(eq(auditLog.companyId, companyId))
    .orderBy(asc(auditLog.id));
}

// One expected row, as auditRows returns it.
export const auditRow = (
  companyId: string,
  actorUserId: string,
  action: string,
  entityId: string | null,
  change: { before?: unknown; after: unknown },
) => ({
  companyId,
  actorUserId,
  action,
  entityTable: action.slice(0, action.indexOf(".")),
  entityId,
  before: change.before ?? null,
  after: change.after,
});

// The runtime role's INSERT on audit_log taken away while `body` runs: what a failing audit
// write looks like to a procedure. A grant is the whole database's, so only ever in a
// disposable one.
export async function withoutAuditInsert(owner: Db, body: () => Promise<void>) {
  await owner.execute(sql`revoke insert on audit_log from trader_app`);
  try {
    await body();
  } finally {
    await owner.execute(sql`grant insert on audit_log to trader_app`);
  }
}
