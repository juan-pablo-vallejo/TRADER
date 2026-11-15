// developer.get: how the deployment stands, for an admin to read (PRD, Office review and job
// cost: the developer console; DESIGN, Developer console; ARCHITECTURE, 2026-11-15). The sync
// mode and minimum builds as the service reads them, the protocol range, whether the
// schedule is enforced for the caller's company, the role this request's database session
// runs as, and the newest refused-entry lines inside their retention. A read under the
// caller's tenant: it writes nothing, takes no lock, and what it cannot read as the
// application role in that tenant it does not show. It is no path around a gate and adds no
// role: an admin of one company learns nothing of another. No secret is read: the three
// variables it reports are the operational switches of status.ts, never a key.
// Consumed by routers/developer.ts.
import { companies, syncDiagnostics, users } from "@trader/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { configuredStatus, STATES } from "../core/status";
import { RETENTION_DAYS } from "../sync/diagnostics";
import { SYNC_PROTOCOL } from "../sync/protocol";

export const RECENT_REFUSALS = 20;

const build = z.number().int().positive().nullable();

export const developerOutput = z.strictObject({
  sync: z.strictObject({
    // Null: the variable holds something the service does not know, and it runs as paused.
    mode: z.enum(STATES).nullable(),
    minimumBuilds: z.strictObject({ ios: build, android: build }),
    protocol: z.strictObject({ min: z.number().int(), max: z.number().int() }),
  }),
  scheduleEnforced: z.boolean(),
  // The role the request's statements run as: `trader_app` on every deployment.
  databaseRole: z.string(),
  refusals: z.strictObject({
    // Lines inside the retention period, and those of the last day among them.
    retained: z.number().int().nonnegative(),
    lastDay: z.number().int().nonnegative(),
    // The newest first. No payload, location or time of the entry is ever in a line.
    recent: z.array(
      z.strictObject({
        at: z.date(),
        employee: z.string().nullable(),
        recordKind: z.string().nullable(),
        // `rejected`, `omitted` or `request_failed`: text in the store, as its code is.
        outcome: z.string(),
        code: z.string(),
      }),
    ),
  }),
});

export async function developerView(
  tx: Tx,
  env: Record<string, string | undefined>,
): Promise<z.infer<typeof developerOutput>> {
  // One row: the tenant's own, under row-level security.
  const [company] = await tx
    .select({ scheduleEnforced: companies.scheduleEnforced })
    .from(companies);
  if (company === undefined) throw new Error("the caller's company is not visible");
  const role = await tx.execute<{ role: string }>(sql`select current_user as role`);
  const retained = sql`${syncDiagnostics.createdAt} >= now() - make_interval(days => ${RETENTION_DAYS})`;
  const recent = await tx
    .select({
      at: syncDiagnostics.createdAt,
      employee: users.name,
      recordKind: syncDiagnostics.recordKind,
      outcome: syncDiagnostics.outcome,
      code: syncDiagnostics.code,
    })
    .from(syncDiagnostics)
    .leftJoin(users, eq(users.id, syncDiagnostics.userId))
    .where(retained)
    .orderBy(desc(syncDiagnostics.createdAt), desc(syncDiagnostics.id))
    .limit(RECENT_REFUSALS);
  return {
    sync: { ...configuredStatus(env), protocol: SYNC_PROTOCOL },
    scheduleEnforced: company.scheduleEnforced,
    databaseRole: role.rows[0]!.role,
    refusals: {
      retained: await tx.$count(syncDiagnostics, retained),
      lastDay: await tx.$count(
        syncDiagnostics,
        sql`${syncDiagnostics.createdAt} >= now() - interval '1 day'`,
      ),
      recent,
    },
  };
}
