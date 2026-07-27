import { protectedProcedure, router } from "../trpc.js";

/**
 * The signed-in caller's own record.
 *
 * Deliberately the only procedure in Phase 0: its done-criteria is that an admin
 * signs in on web and a worker on mobile, and each sees its own role against the
 * real deployed stack. Anything more belongs to Phase 2.
 *
 * Returns a narrowed shape rather than the whole row — `payRateCents` is
 * admin-only per SPEC §5, and a worker reading their own record must not become
 * the route by which other people's pay leaks later.
 */
export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    companyId: ctx.user.companyId,
    role: ctx.user.role,
    name: ctx.user.name,
    phone: ctx.user.phone,
    active: ctx.user.active,
  })),
});
