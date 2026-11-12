// A foreman's scope over one job (ARCHITECTURE row 195): the job's current crew's foreman, the
// crew active, the caller still an active foreman. Every input is read under a row lock held to
// commit, in the global order (jobs, crews, users, companies; ARCHITECTURE row 193), so a
// concurrent office change either committed first and is seen here, or waits for the caller's
// transaction to end. One FORBIDDEN for a job that is invisible (another tenant's, under RLS),
// unstaffed or another foreman's, so nothing says which. Consumed through lockCloseoutScope
// below by submit.ts (the job held NO KEY UPDATE, serializing closeouts of one job without
// blocking labor and material inserts, whose foreign-key checks take KEY SHARE) and review.ts
// (held FOR SHARE: a read), and directly by materials/correct.ts (held FOR SHARE).
import { companies, crews, jobs } from "@trader/db/schema";
import { eq } from "drizzle-orm";

import type { Tx } from "../core/context";
import { lockActiveSelf } from "../core/locks";
import type { AppUser } from "../core/resolve-user";
import { forbidden } from "../core/trpc";

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

  return { jobName: job.name, jobStatus: job.status, timeZone: await lockZone(tx, user) };
}

// The company may change its zone; the lock holds it for the caller's transaction. Also
// consumed by materials/create.ts.
export async function lockZone(tx: Tx, user: AppUser): Promise<string> {
  const [company] = await tx
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .for("share");
  if (company === undefined) throw new Error("the caller's company is not visible");
  return company.timezone;
}

// Who may review and submit a day closeout (ARCHITECTURE, Office authority: admin closeout;
// V1-D08): a foreman through the scope above, unchanged, or an admin for any job of the
// company — archived, on no crew or on a deactivated one. The admin's authority reads no
// crew, so it locks none: the job, then the caller re-read as an active admin, then the
// company, a subsequence of the same global order. A job that is not visible (another
// tenant's, under RLS) is the one FORBIDDEN. Any other role is refused before a lock is
// taken. Consumed by submit.ts and review.ts.
export type CloseoutScope = ForemanScope;

export async function lockCloseoutScope(
  tx: Tx,
  user: AppUser,
  jobId: string,
  jobLock: "no key update" | "share",
): Promise<CloseoutScope> {
  if (user.role === "foreman") return lockForemanScope(tx, user, jobId, jobLock);
  if (user.role !== "admin") throw forbidden();

  const [job] = await tx
    .select({ name: jobs.name, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for(jobLock);
  if (job === undefined) throw forbidden();

  await lockActiveSelf(tx, user, "admin");

  return { jobName: job.name, jobStatus: job.status, timeZone: await lockZone(tx, user) };
}
