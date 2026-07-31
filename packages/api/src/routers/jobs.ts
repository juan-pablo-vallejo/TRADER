import { jobs } from "@trader/db";
import { and, asc, eq, inArray } from "drizzle-orm";

import { protectedProcedure, router } from "../trpc";

/**
 * Reading jobs. **Read-only by design in Phase 1** — ROADMAP hand-seeds jobs and
 * the roster until Phase 2, which owns self-service setup. A worker still has to
 * see which job they are clocking into, so the list ships here; creating and
 * editing does not.
 */
export const jobsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: jobs.id,
        address: jobs.address,
        status: jobs.status,
        crewId: jobs.crewId,
      })
      .from(jobs)
      .where(
        and(
          // The tenancy seam: every query is company-scoped, so the eventual
          // second tenant cannot see the first through a forgotten filter.
          eq(jobs.companyId, ctx.user.companyId),
          // Archived and closed jobs cannot be clocked into; showing them would
          // only offer the crew a way to file labor against finished work.
          inArray(jobs.status, ["scheduled", "active"]),
        ),
      )
      .orderBy(asc(jobs.createdAt));

    return rows;
  }),
});
