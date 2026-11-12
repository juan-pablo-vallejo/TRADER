// tRPC with superjson (Dates survive the wire) and the protected procedure: one transaction
// per procedure call, in which the request is authenticated, its tenant established, and the
// procedure run. Nothing a client sends names a company, a role or a subject.
import { assertRuntimeRole } from "@trader/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import superjson from "superjson";

import type { Db } from "@trader/db";

import type { CallerTimeouts, CallerWaits, Context, Tx } from "./context";
import type { VerifiedIdentity } from "./identity";
import { reportFailure } from "./report";
import { BindConflict, resolveUser, type AppUser } from "./resolve-user";
import {
  DIAGNOSTIC_TIMEOUTS,
  requestFailed,
  writeDiagnostics,
  type DiagnosticLine,
  type Note,
} from "../sync/diagnostics";

// One message for every way of not being a signed-in, active, invited user, so a response
// never says whether an invitation exists.
const UNAUTHORIZED_MESSAGE = "Sign-in required.";
export const unauthorized = () =>
  new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHORIZED_MESSAGE });

// One message for every gate, naming no role, so a denial never says what would be admitted.
// Exported so a procedure's own resource checks answer exactly as a gate does.
const FORBIDDEN_MESSAGE = "Not permitted.";
export const forbidden = () =>
  new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MESSAGE });

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // An internal error's message and stack can carry SQL or row data; a client gets neither.
  errorFormatter({ shape }) {
    if (shape.data.code !== "INTERNAL_SERVER_ERROR") return shape;
    return {
      ...shape,
      message: "Internal server error.",
      data: { ...shape.data, stack: undefined },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

// The protected sequence, in one transaction of its own: settings cleared, the runtime role
// checked, the identity resolved (or bound) to an active user, the identity cleared and the
// tenant set; then `body` runs in that transaction, which commits when it returns and rolls back
// when it throws. The protected procedure runs it once per call; sync.push once per record
// (ARCHITECTURE, sync.push), so a record's authority is re-read every time.
export type { CallerTimeouts };

export async function inCallerTransaction<T>(
  db: Db,
  identity: VerifiedIdentity,
  body: (tx: Tx, user: AppUser) => Promise<T>,
  waits: CallerWaits,
  // False only for the diagnostics write below: it resolves a bound caller and binds no one.
  bind = true,
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      // First statement: a pooled connection may carry session-level values; these
      // transaction-local ones override them until this transaction ends.
      await tx.execute(sql`
        select set_config('app.company_id', '', true),
          set_config('app.identity_subject', '', true),
          set_config('app.identity_email', '', true)
      `);
      // Bounded waits before anything can wait: a first sign-in's bind can queue on a users
      // row, and nothing else would cap it.
      if (waits !== "inherit") {
        await tx.execute(sql`
          select set_config('lock_timeout', ${waits.lockTimeout}, true),
            set_config('statement_timeout', ${waits.statementTimeout}, true)
        `);
      }
      // Every transaction: a pool's connections are checked one by one, not once per process.
      await assertRuntimeRole(tx);
      await tx.execute(sql`
        select set_config('app.identity_subject', ${identity.subject}, true),
          set_config('app.identity_email', ${identity.email}, true)
      `);
      const user = await resolveUser(tx, identity, { bind });
      if (user === null) throw unauthorized();
      // Identity settings off before the tenant goes on: 0015's guard refuses every update
      // but the bind while either is present.
      await tx.execute(sql`
        select set_config('app.identity_subject', '', true),
          set_config('app.identity_email', '', true),
          set_config('app.company_id', ${user.companyId}, true)
      `);
      return body(tx, user);
    });
  } catch (error) {
    if (error instanceof BindConflict) throw unauthorized();
    throw error;
  }
}

// Every protected call's waits are bounded: without a bound, one stalled writer holding the
// company's field-write lock or a users row queues every later call until the pool is empty.
// Generous beside sync's, because an office call is one person waiting at a screen, not a
// device that retries: 5 s for a lock, 20 s on a statement. A call that times out fails as
// an internal error and writes nothing.
export const PROTECTED_TIMEOUTS: CallerTimeouts = {
  lockTimeout: "5s",
  statementTimeout: "20s",
};

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { db, identity, waits } = ctx;
  if (identity === null) throw unauthorized();
  const run = async (tx: Tx, user: AppUser) => {
    // tRPC merges this into the existing context ({ ...ctx, ...this }), so the pool and the
    // identity are removed by value here, not only by type: a procedure has `tx` and nothing
    // that could open a connection outside this transaction.
    const result = await next({
      ctx: { db: undefined, identity: undefined, waits: undefined, tx, user },
    });
    // A failed procedure comes back as { ok: false }, not a throw; returning it would let
    // Drizzle commit whatever the procedure wrote before it failed.
    if (!result.ok) throw result.error;
    return result;
  };
  return inCallerTransaction(db, identity, run, waits ?? PROTECTED_TIMEOUTS);
});

// sync.push's procedure: no transaction of its own. The call gets `runRecord`, which opens one
// caller transaction per record, and neither the pool nor the identity, removed by value as
// in the protected procedure. A call without an identity is UNAUTHORIZED before anything runs.
// Every record's transaction waits at most 2 s for a lock and 4 s on a statement, from its
// first statement on, identity resolution included (ARCHITECTURE, sync.push): a record that
// times out is left out and retried.
export const SYNC_TIMEOUTS: CallerTimeouts = {
  lockTimeout: "2s",
  statementTimeout: "4s",
};

//
// It also keeps the call's diagnostic lines (sync/diagnostics.ts). The procedure gets `note`,
// which only collects; once the call has settled — every record's transaction ended, the answer
// decided — the lines are written in one more caller transaction. A call that failed as a whole
// leaves one line in place of whatever was noted, and none when the failure is UNAUTHORIZED:
// that caller has no tenant to write under. The write resolves a caller who is already bound
// and never performs a first sign-in: a push that failed before binding still binds nothing. The write is awaited, because a serverless function
// may be frozen once it answers, and guarded: whatever it throws is reported and dropped, and
// the call's result is returned exactly as it was.
export const syncProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { db, identity, waits, reporter, requestId } = ctx;
  if (identity === null) throw unauthorized();
  const runRecord = <T>(body: (tx: Tx, user: AppUser) => Promise<T>) =>
    inCallerTransaction(db, identity, body, waits ?? SYNC_TIMEOUTS);
  const noted: DiagnosticLine[] = [];
  const note: Note = (line) => {
    noted.push(line);
  };
  const result = await next({
    ctx: { db: undefined, identity: undefined, waits: undefined, runRecord, note },
  });
  const lines = result.ok
    ? noted
    : result.error.code === "UNAUTHORIZED"
      ? []
      : [requestFailed(result.error.code)];
  if (lines.length > 0) {
    try {
      await inCallerTransaction(
        db,
        identity,
        (tx, user) => writeDiagnostics(tx, user, requestId, lines),
        waits === "inherit" ? "inherit" : DIAGNOSTIC_TIMEOUTS,
        false,
      );
    } catch (error) {
      // Reported when it is an incident; a caller deactivated since is not one.
      reportFailure(reporter, error, {
        source: "diagnostics",
        path: "sync.push",
        type: "mutation",
        requestId,
      });
    }
  }
  return result;
});

// A role gate: procedure entry for the listed roles only, judged on the role resolved from the
// database inside the protected transaction. An allowlist, not a rank, so a role added to the
// enum later is admitted nowhere until a procedure names it. It checks entry only: a worker's
// assigned jobs and a foreman's crews are scoped inside each procedure that needs them. A
// denial is a failed call, so the protected procedure rolls its transaction back.
export const roleProcedure = (...allowed: [AppUser["role"], ...AppUser["role"][]]) => {
  const admitted = new Set(allowed);
  return protectedProcedure.use(({ ctx, next }) => {
    if (!admitted.has(ctx.user.role)) {
      throw forbidden();
    }
    return next();
  });
};
