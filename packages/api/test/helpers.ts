// Shared by the API tests. Unlike the schema tests, nothing here can run in a rolled-back
// transaction: the code under test opens its own. Fixtures are therefore committed by the
// owner, under company names with a random suffix, and deleted afterwards. No fixture writes
// a work_session_event, so the deletes are always allowed.
import { createDb, type Db } from "@trader/db";
import { companies, customers, users } from "@trader/db/schema";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { eq, inArray, sql } from "drizzle-orm";
import superjson from "superjson";
import { z } from "zod";

import { createContext, type Tx } from "../src/context";
import type { VerifiedIdentity } from "../src/identity";
import type { AppUser } from "../src/resolve-user";
import {
  createCallerFactory,
  protectedProcedure,
  roleProcedure,
  router,
} from "../src/trpc";

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
  const cleanup = async () => {
    const ids = [a.companyId, b.companyId];
    await owner.delete(customers).where(inArray(customers.companyId, ids));
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
  opts: { deactivated?: boolean } = {},
) {
  const tag = `${role}-${opts.deactivated ? "off" : "on"}-${company}-${w.run}`;
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

// Resolves once `n` backends are blocked on a lock inside an UPDATE of users: the point at
// which a test holding a row lock can release it and know both requests race.
export async function waitForBlockedUpdates(owner: Db, n: number) {
  for (let i = 0; i < 200; i++) {
    const { rows } = await owner.execute<{ blocked: number }>(sql`
      select count(*)::int as blocked from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
        and query ilike 'update "users"%'
    `);
    if ((rows[0]?.blocked ?? 0) >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected ${n} blocked updates`);
}

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
  createCallerFactory(testRouter)(createContext({ db, identity: who }));

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
  } = {},
) {
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
    router: testRouter,
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
      }),
  });
  const body = (await response.json()) as HttpResult | HttpResult[];
  return { status: response.status, results: Array.isArray(body) ? body : [body] };
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
