// What every owner-side writer checks before its first write: FORCE (0014) denies every row
// to a role with no policy that does not bypass row-level security, and the attribute is
// never inherited through membership (MEMORY), so it is read on the role itself. The seed
// and the onboarding both write companies and invoice_counters, which trader_app may not
// insert (0013): this is the startup guard's inverse.
import { sql } from "drizzle-orm";

import type { Db } from "./client";

// A client or a transaction, as in guard.ts.
export type Executor = Pick<Db, "execute">;

// Returns the role's name. `what` finishes "refusing to …": "seed", "onboard".
export async function assertBypassingRole(
  executor: Executor,
  what: string,
): Promise<string> {
  const { rows } = await executor.execute<{ me: string; bypasses: boolean }>(sql`
    SELECT rolname AS me, rolsuper OR rolbypassrls AS bypasses
    FROM pg_roles WHERE rolname = current_user
  `);
  const role = rows[0];
  if (role === undefined) {
    throw new Error(`refusing to ${what}: current_user has no pg_roles row`);
  }
  if (!role.bypasses) {
    throw new Error(
      `refusing to ${what} as ${role.me}: the role has neither rolsuper nor rolbypassrls`,
    );
  }
  return role.me;
}
