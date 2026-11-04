// The startup guard (ARCHITECTURE invariant 5): refuses to serve under a role that bypasses
// row-level security, or a database where a tenant table lacks ENABLE and FORCE. One round
// trip, run on every call. The API runs it in every protected transaction, before the
// identity or the tenant is set: a pool's connections are each checked, none is trusted
// because another passed. Never at module load, so `next build` never connects (RULES).
// The check is on current_user, so production must log in as trader_app (verified at Stage
// 6): a SET ROLE could be reset.
import { sql } from "drizzle-orm";

import type { Db } from "./client";

// A client or a transaction: both execute raw SQL the same way.
type Executor = Pick<Db, "execute">;

type Verdict = {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  unguarded: string[];
};

export async function assertRuntimeRole(executor: Executor): Promise<void> {
  // Tenant tables are companies and every table with a company_id column, read from the
  // catalog so a table added without RLS is caught even if no migration list names it.
  const { rows } = await executor.execute<Verdict>(sql`
    SELECT r.rolname, r.rolsuper, r.rolbypassrls,
      coalesce(array_agg(c.relname::text ORDER BY c.relname)
        FILTER (WHERE c.oid IS NOT NULL), '{}') AS unguarded
    FROM pg_roles r
    LEFT JOIN pg_class c
      ON c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
      AND (c.relname = 'companies' OR EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'company_id' AND NOT a.attisdropped))
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
    WHERE r.rolname = current_user
    GROUP BY r.rolname, r.rolsuper, r.rolbypassrls
  `);
  const verdict = rows[0];
  if (verdict === undefined)
    throw new Error("refusing to run: current_user has no pg_roles row");
  const reasons = [
    ...(verdict.rolsuper ? ["superuser"] : []),
    ...(verdict.rolbypassrls ? ["bypasses row-level security"] : []),
    ...(verdict.unguarded.length > 0
      ? [`tables without forced RLS: ${verdict.unguarded.join(", ")}`]
      : []),
  ];
  if (reasons.length > 0) {
    throw new Error(`refusing to run as ${verdict.rolname}: ${reasons.join("; ")}`);
  }
}
