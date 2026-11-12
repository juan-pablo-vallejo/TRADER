// Shared by the web tests. Fixtures are committed by the owner under a run suffix and deleted
// afterwards, as the api suite does; nothing here writes an append-only row.
import { createDb, type Db } from "@trader/db";
import {
  companies,
  crewMembers,
  crews,
  customers,
  jobs,
  payRates,
  syncDiagnostics,
  users,
} from "@trader/db/schema";
import type { ErrorReport, ErrorReporter } from "@trader/api";
import { eq } from "drizzle-orm";

import { ENDPOINT } from "../src/server/handler";

// The owner: writes fixtures and reads them back past RLS.
export const ownerDb = () => createDb();

// A database that throws on any use, so a test proves a path never touched it.
export const unusableDb = new Proxy(
  {},
  {
    get() {
      throw new Error("the database was touched");
    },
  },
) as Db;

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

// One query through a handler, unbatched, as a client sends it: the input in superjson's
// envelope on the query string. `status` is that one call's.
export async function query(
  handler: (req: Request) => Promise<Response>,
  path: string,
  opts: { input?: unknown; headers?: Record<string, string> } = {},
) {
  const url = new URL(`http://test${ENDPOINT}/${path}`);
  if (opts.input !== undefined) {
    url.searchParams.set("input", JSON.stringify({ json: opts.input }));
  }
  const response = await handler(new Request(url, { headers: opts.headers }));
  const body = (await response.json()) as TrpcResult;
  return { status: response.status, headers: response.headers, body };
}

// One mutation through a handler, unbatched, as a client sends it: POST with the input in
// superjson's envelope as the body.
export async function mutate(
  handler: (req: Request) => Promise<Response>,
  path: string,
  opts: { input?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await handler(
    new Request(`http://test${ENDPOINT}/${path}`, {
      method: "POST",
      headers: { ...opts.headers, "content-type": "application/json" },
      body: JSON.stringify({ json: opts.input ?? null }),
    }),
  );
  const body = (await response.json()) as TrpcResult;
  return { status: response.status, headers: response.headers, body };
}

export type TrpcResult = {
  result?: { data: { json: unknown } };
  error?: { json: { message: string; data: { code: string; httpStatus: number } } };
};

// One company with one unbound invitation, a worker unless a role is named, committed;
// `cleanup` removes the company and everything the test wrote under it.
export async function invitation(
  owner: Db,
  opts: { role?: "admin" | "foreman" | "worker" } = {},
) {
  const run = crypto.randomUUID().slice(0, 8);
  const [company] = await owner
    .insert(companies)
    .values({ name: `Web Co ${run}`, timezone: "America/New_York" })
    .returning({ id: companies.id });
  const companyId = company!.id;
  const email = `invite-${run}@web.test`;
  const [user] = await owner
    .insert(users)
    .values({ companyId, email, name: `Invite ${run}`, role: opts.role ?? "worker" })
    .returning({ id: users.id });
  // In reference order: a test may have written any of these.
  const cleanup = async () => {
    await owner.delete(syncDiagnostics).where(eq(syncDiagnostics.companyId, companyId));
    await owner.delete(crewMembers).where(eq(crewMembers.companyId, companyId));
    await owner.delete(jobs).where(eq(jobs.companyId, companyId));
    await owner.delete(crews).where(eq(crews.companyId, companyId));
    await owner.delete(customers).where(eq(customers.companyId, companyId));
    await owner.delete(payRates).where(eq(payRates.companyId, companyId));
    await owner.delete(users).where(eq(users.companyId, companyId));
    await owner.delete(companies).where(eq(companies.id, companyId));
  };
  return { run, companyId, userId: user!.id, email, cleanup };
}
