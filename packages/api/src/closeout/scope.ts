// A foreman's scope over one job (ARCHITECTURE row 195): the job's current crew's foreman, the
// crew active, the caller still an active foreman. Every input is read under a row lock held to
// commit, in the global order (jobs, crews, users, companies; ARCHITECTURE row 193), so a
// concurrent office change either committed first and is seen here, or waits for the caller's
// transaction to end. One FORBIDDEN for a job that is invisible (another tenant's, under RLS),
// unstaffed or another foreman's, so nothing says which. Consumed by submit.ts (the job held
// NO KEY UPDATE, serializing closeouts of one job without blocking labor and material inserts,
// whose foreign-key checks take KEY SHARE) and review.ts (held FOR SHARE: a read), and by
// materials/correct.ts (held FOR SHARE).
import { companies, crews, jobs, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden, unauthorized } from "../core/trpc";

export type ForemanScope = {
  jobName: string;
  jobStatus: (typeof jobs.$inferSelect)["status"];
  // companies.timezone as read under lock: the zone the day is judged in.
  timeZone: string;
};

export async function lockForemanScope(
  tx: Tx,
  user: AppUser,
  jobId: string,
  jobLock: "no key update" | "share",
): Promise<ForemanScope> {
  const [job] = await tx
    .select({ crewId: jobs.crewId, name: jobs.name, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for(jobLock);
  if (job === undefined || job.crewId === null) throw forbidden();

  const [crew] = await tx
    .select({ foremanUserId: crews.foremanUserId, deactivatedAt: crews.deactivatedAt })
    .from(crews)
    .where(eq(crews.id, job.crewId))
    .for("share");
  if (
    crew === undefined ||
    crew.foremanUserId !== user.id ||
    crew.deactivatedAt !== null
  ) {
    throw forbidden();
  }

  await lockActiveSelf(tx, user, "foreman");

  // The company may change its zone; the lock holds it for the caller's transaction.
  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .for("share");
  if (company === undefined) throw new Error("the caller's company is not visible");

  return { jobName: job.name, jobStatus: job.status, timeZone: company.timezone };
}

// The caller, re-read under a lock held to commit: resolution read it without one. A
// deactivated caller is UNAUTHORIZED, as at resolution; a changed role is FORBIDDEN. Consumed
// by lockForemanScope above and by materials/correct.ts for an admin.
export async function lockActiveSelf(
  tx: Tx,
  user: AppUser,
  role: AppUser["role"],
): Promise<void> {
  const [self] = await tx
    .select({ role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .for("share");
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  if (self.role !== role) throw forbidden();
}
