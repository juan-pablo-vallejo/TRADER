// tRPC with superjson (Dates survive the wire) and the protected procedure: one transaction
// per procedure call, in which the request is authenticated, its tenant established, and the
// procedure run. Nothing a client sends names a company, a role or a subject.
import { assertRuntimeRole } from "@trader/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import superjson from "superjson";

import type { Context } from "./context";
import { BindConflict, resolveUser, type AppUser } from "./resolve-user";

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

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { db, identity } = ctx;
  if (identity === null) throw unauthorized();
  try {
    return await db.transaction(async (tx) => {
      // First statement: a pooled connection may carry session-level values; these
      // transaction-local ones override them until this transaction ends.
      await tx.execute(sql`
        select set_config('app.company_id', '', true),
          set_config('app.identity_subject', '', true),
          set_config('app.identity_email', '', true)
      `);
      // Every transaction: a pool's connections are checked one by one, not once per process.
      await assertRuntimeRole(tx);
      await tx.execute(sql`
        select set_config('app.identity_subject', ${identity.subject}, true),
          set_config('app.identity_email', ${identity.email}, true)
      `);
      const user = await resolveUser(tx, identity);
      if (user === null) throw unauthorized();
      // Identity settings off before the tenant goes on: 0015's guard refuses every update
      // but the bind while either is present.
      await tx.execute(sql`
        select set_config('app.identity_subject', '', true),
          set_config('app.identity_email', '', true),
          set_config('app.company_id', ${user.companyId}, true)
      `);
      // tRPC merges this into the existing context ({ ...ctx, ...this }), so the pool and the
      // identity are removed by value here, not only by type: a procedure has `tx` and nothing
      // that could open a connection outside this transaction.
      const result = await next({
        ctx: { db: undefined, identity: undefined, tx, user },
      });
      // A failed procedure comes back as { ok: false }, not a throw; returning it would let
      // Drizzle commit whatever the procedure wrote before it failed.
      if (!result.ok) throw result.error;
      return result;
    });
  } catch (error) {
    if (error instanceof BindConflict) throw unauthorized();
    throw error;
  }
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
