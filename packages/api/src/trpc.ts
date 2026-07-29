import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import type { AppUser, Context } from "./context.js";

const t = initTRPC.context<Context>().create({
  /**
   * JSON turns Dates into strings. Every table carries created_at/updated_at and
   * the labor events carry client and server timestamps, so the sync layer in
   * Phase 1 is almost entirely about timestamps — exactly where a silent
   * Date-to-string conversion is expensive. Adding a transformer later is a
   * breaking change that has to land on the server and both clients together.
   */
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface field-level validation detail; without this a client only
        // learns "BAD_REQUEST" and has to guess which input was wrong.
        zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Requires a verified caller who is still active. Implements docs/logic.md PERM-3.
 *
 * The `active` check is not incidental. "Delete my account" is defined as
 * deactivate-and-anonymise, because labor history survives by database trigger
 * and by payroll retention law. If a deactivated account could still clock in,
 * that definition would be cosmetic — this is where it becomes enforcement.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign-in required." });
  }
  if (!ctx.user.active) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "This account is deactivated.",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** The docs/logic.md PERM-1 matrix, narrowing outward: worker ⊂ foreman ⊂ admin. */
function requireRole(...allowed: AppUser["role"][]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!allowed.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires role: ${allowed.join(" or ")}.`,
      });
    }
    return next({ ctx });
  });
}

/** A foreman's own crew work, plus anything an admin may do. */
export const foremanProcedure = requireRole("foreman", "admin");

/** Roster, pay rates, customers, invoices, corrections. */
export const adminProcedure = requireRole("admin");
