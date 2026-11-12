// Shared by the demo tests: a unique pattern-matching database name per test file, the
// migrations folder, a query spy on a pool, and the owner-side counts the run is held to.
import { fileURLToPath } from "node:url";

import type { Db } from "@trader/db";
import { sql } from "drizzle-orm";

export const MIGRATIONS = fileURLToPath(
  new URL("../../../db/migrations", import.meta.url),
);

export const uniqueDemoName = () =>
  `trader_demo_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

// Records the text of every statement the pool sends. Drizzle's node-postgres session sends a
// plain statement as `pool.query({ text, values, rowMode })`, which checks a client out through
// `pool.connect(callback)`, and runs a transaction on a client from `pool.connect()`; every
// statement therefore passes through a client's `query`, wrapped once per pooled client.
export function spyOnQueries(db: Db, record: (text: string) => void) {
  type Queryable = { query: (...args: unknown[]) => unknown };
  const textOf = (q: unknown) =>
    typeof q === "string" ? q : ((q as { text?: string }).text ?? "<unknown>");
  const wrapQuery = (target: Queryable) => {
    const original = target.query.bind(target);
    target.query = (...args: unknown[]) => {
      record(textOf(args[0]));
      return original(...args);
    };
  };
  const pool = db.$client as unknown as Queryable & {
    connect: (...args: unknown[]) => unknown;
  };
  // Clients only: a plain pool.query also runs on a checked-out client, so recording there once
  // covers both paths without a duplicate.
  const wrapped = new WeakSet<Queryable>();
  const wrapClient = (client: Queryable | undefined) => {
    if (client !== undefined && !wrapped.has(client)) {
      wrapQuery(client);
      wrapped.add(client);
    }
  };
  // pg's connect has two forms: with a callback (how pool.query checks a client out) and as a
  // promise (how a Drizzle transaction does); each hands the client through once.
  const connect = pool.connect.bind(pool);
  pool.connect = (...args: unknown[]) => {
    const [first, ...rest] = args;
    if (typeof first === "function") {
      return connect(
        (err: unknown, client: Queryable | undefined, release: unknown) => {
          wrapClient(client);
          (first as (...a: unknown[]) => void)(err, client, release);
        },
        ...rest,
      );
    }
    return (connect(...args) as Promise<Queryable>).then((client) => {
      wrapClient(client);
      return client;
    });
  };
}

export async function count(db: Db, table: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)}`,
  );
  return rows[0]!.n;
}

export async function counts(db: Db) {
  const [
    users,
    customers,
    jobs,
    crews,
    crewMembers,
    payRates,
    events,
    materials,
    priced,
    corrections,
    closeouts,
    approvals,
    decided,
    assignments,
  ] = await Promise.all([
    count(db, "users"),
    count(db, "customers"),
    count(db, "jobs"),
    count(db, "crews"),
    count(db, "crew_members"),
    count(db, "pay_rates"),
    count(db, "work_session_events"),
    count(db, "materials"),
    db
      .execute<{ n: number }>(
        sql`select count(*)::int as n from materials where cost_cents is not null`,
      )
      .then((r) => r.rows[0]!.n),
    count(db, "material_corrections"),
    count(db, "day_closeouts"),
    count(db, "approvals"),
    db
      .execute<{ n: number }>(
        sql`select count(*)::int as n from approvals where decision is not null`,
      )
      .then((r) => r.rows[0]!.n),
    count(db, "job_assignments"),
  ]);
  return {
    users,
    customers,
    jobs,
    crews,
    crewMembers,
    payRates,
    events,
    materials,
    pricedMaterials: priced,
    materialCorrections: corrections,
    closeouts,
    approvals,
    decided,
    assignments,
  };
}

// The audit rows by action, as the owner reads them: an action nobody performed is absent.
export async function auditCounts(db: Db): Promise<Record<string, number>> {
  const { rows } = await db.execute<{ action: string; n: number }>(
    sql`select action, count(*)::int as n from audit_log group by action`,
  );
  return Object.fromEntries(rows.map((r) => [r.action, r.n]));
}
