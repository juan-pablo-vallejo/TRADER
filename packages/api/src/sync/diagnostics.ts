// Rejected-record diagnostics (ARCHITECTURE, Sync protocol; V1-D04): the minimized lines a push
// leaves in sync_diagnostics for what the server refused or did not process, so the office can
// answer "where are my hours" without the phone. Observability, not the ledger: a line is
// written after every record's own transaction has ended, in a transaction of its own, and
// nothing here can change a push's answer or undo a commit. The device's outbox stays the
// durable copy; a record that never reached the server leaves nothing.
//
// A line is what the server did, in its own vocabulary — the request id, the record's id and
// kind where they could be read, an outcome and a code — under the caller's user and company.
// Never the payload, a location, the record's own time or an error's text. Consumed by
// core/trpc.ts (the sync procedure writes) and sync/push.ts (the loop notes).
import { companies, syncDiagnostics } from "@trader/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { CallerTimeouts, Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";

export type DiagnosticOutcome = "rejected" | "omitted" | "request_failed";

export type DiagnosticLine = {
  recordId: string | null;
  recordKind: string | null;
  outcome: DiagnosticOutcome;
  code: string;
};

// What push.ts hands a line to. Synchronous, and never throws.
export type Note = (line: DiagnosticLine) => void;

// How long a line is kept (ARCHITECTURE, decision of 2026-11-11): long enough for a question
// raised at the next payday, short enough to stay the PRD's "short-lived" note.
export const RETENTION_DAYS = 30;
// Expired lines deleted per write: a company back after a long silence deletes its backlog
// over several writes instead of one statement that outlives its timeout.
export const PRUNE_BATCH = 500;
// Lines one caller may leave in 24 hours. A device looping on a bad batch would otherwise
// grow the table without bound; past the cap its lines are dropped, silently.
export const USER_DAILY_CAP = 1_000;
// Tighter than a record's own waits (trpc.ts, SYNC_TIMEOUTS): this transaction contends with
// nothing but another writer's delete, and a push must not be held for it.
export const DIAGNOSTIC_TIMEOUTS: CallerTimeouts = {
  lockTimeout: "1s",
  statementTimeout: "2s",
};

const CODE = /^[a-z_]{1,64}$/;
const KIND = /^[a-z_]{1,40}$/;

// A call that failed as a whole: one line, naming no record. `code` is tRPC's
// (BAD_REQUEST, INTERNAL_SERVER_ERROR), lower-cased into this table's form.
export function requestFailed(code: string): DiagnosticLine {
  const lowered = code.toLowerCase();
  return {
    recordId: null,
    recordKind: null,
    outcome: "request_failed",
    code: CODE.test(lowered) ? lowered : "unknown",
  };
}

// The lines the table's checks would take. A code comes from a handler's own vocabulary and a
// kind from the envelope's enum, so nothing should fail here; one that does is dropped rather
// than allowed to fail the statement that carries the others.
function writable(lines: readonly DiagnosticLine[]): DiagnosticLine[] {
  return lines.filter(
    (l) =>
      CODE.test(l.code) &&
      (l.recordKind === null || KIND.test(l.recordKind)) &&
      (l.outcome !== "request_failed" || (l.recordId === null && l.recordKind === null)),
  );
}

// One caller transaction (trpc.ts): delete the company's expired lines, then insert these,
// unless the caller is at the cap. Row-level security scopes every statement to the tenant.
export async function writeDiagnostics(
  tx: Tx,
  user: AppUser,
  requestId: string,
  lines: readonly DiagnosticLine[],
): Promise<void> {
  // Retention, enforced where lines are written: no scheduler exists before Stage 6.
  await tx.execute(sql`
    delete from sync_diagnostics where id in (
      select id from sync_diagnostics
      where created_at < now() - make_interval(days => ${RETENTION_DAYS})
      order by created_at
      limit ${PRUNE_BATCH}
    )
  `);
  const [held] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(syncDiagnostics)
    .where(
      and(
        eq(syncDiagnostics.userId, user.id),
        sql`${syncDiagnostics.createdAt} > now() - interval '24 hours'`,
      ),
    );
  const room = USER_DAILY_CAP - (held?.n ?? 0);
  const rows = writable(lines).slice(0, Math.max(room, 0));
  if (rows.length === 0) return;
  await tx
    .insert(syncDiagnostics)
    .values(
      rows.map((l) => ({
        companyId: user.companyId,
        userId: user.id,
        requestId,
        recordId: l.recordId,
        recordKind: l.recordKind,
        outcome: l.outcome,
        code: l.code,
      })),
    )
    // No target, on purpose: the only unique rule a line can meet is one line per record and
    // code, and a record refused the same way again keeps its first line.
    .onConflictDoNothing();
}

// diagnostic.list (TASKS, Stage 4: "the office can find a refusal by worker and day"). One
// caller's lines received on one day, newest first, for the admin. `userId` is who sent the
// push — a foreman's push for a crew member is the foreman's — and `day` is the calendar day
// the server received it, in the company's zone: never the day worked, which a line does not
// hold. Expired lines are never returned, whether or not a write has deleted them yet. A
// plain read under RLS, no locks. Consumed by routers/diagnostic.ts.
export const LIST_LIMIT = 200;

export const listInput = z.strictObject({
  userId: z.uuid(),
  day: z.iso.date(),
});

export const listOutput = z.array(
  z.strictObject({
    requestId: z.uuid(),
    recordId: z.uuid().nullable(),
    recordKind: z.string().nullable(),
    outcome: z.enum(["rejected", "omitted", "request_failed"]),
    code: z.string(),
    receivedAt: z.date(),
  }),
);

export async function listDiagnostics(
  tx: Tx,
  input: z.infer<typeof listInput>,
): Promise<z.infer<typeof listOutput>> {
  const rows = await tx
    .select({
      requestId: syncDiagnostics.requestId,
      recordId: syncDiagnostics.recordId,
      recordKind: syncDiagnostics.recordKind,
      outcome: syncDiagnostics.outcome,
      code: syncDiagnostics.code,
      receivedAt: syncDiagnostics.createdAt,
    })
    .from(syncDiagnostics)
    .innerJoin(companies, eq(companies.id, syncDiagnostics.companyId))
    .where(
      and(
        eq(syncDiagnostics.userId, input.userId),
        sql`${syncDiagnostics.createdAt} >= now() - make_interval(days => ${RETENTION_DAYS})`,
        sql`(${syncDiagnostics.createdAt} at time zone ${companies.timezone})::date = ${input.day}::date`,
      ),
    )
    .orderBy(desc(syncDiagnostics.createdAt), desc(syncDiagnostics.id))
    .limit(LIST_LIMIT);
  return rows.map((r) => ({ ...r, outcome: r.outcome as DiagnosticOutcome }));
}
