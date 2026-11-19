// Who may push a record, judged at receipt from rows read in the record's own transaction: a
// person records their own labor and nobody else's. The job is held FOR SHARE, then the
// caller's users row FOR SHARE, so an archival or a deactivation in flight waits for this
// push and a later push sees it. A caller deactivated meanwhile is UNAUTHORIZED, as at
// resolution; every other refusal is one `not_permitted` that says nothing of which check
// failed. Consumed by sync/labor.ts.
import { jobs, users } from "@trader/db/schema";
import { eq } from "drizzle-orm";

import type { Tx } from "../core/context";
import type { Role } from "../contract/enums";
import type { AppUser } from "../core/resolve-user";
import { unauthorized } from "../core/trpc";
import type { JobPlace } from "./reasons";

export type PushScope = {
  // The caller's role as locked now, never the resolved one: a change committed since the
  // record's resolution is seen.
  role: Role;
  jobArchived: boolean;
  place: JobPlace;
};

export async function lockPushScope(
  tx: Tx,
  user: AppUser,
  jobId: string,
): Promise<PushScope | null> {
  const [job] = await tx
    .select({
      status: jobs.status,
      lat: jobs.locationLat,
      lng: jobs.locationLng,
      radiusM: jobs.locationRadiusM,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for("share");
  const [self] = await tx
    .select({ role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .for("share");
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  // Invisible (another tenant's, under RLS) or missing: nothing to say about it.
  if (job === undefined) return null;
  const place =
    job.lat !== null && job.lng !== null && job.radiusM !== null
      ? { lat: job.lat, lng: job.lng, radiusM: job.radiusM }
      : null;
  return { role: self.role, jobArchived: job.status === "archived", place };
}

// A person's own event, on a job of their company. A start needs a job that is not
// archived; whether the schedule admits it is asked next (sync/labor.ts). Pause, resume and
// end are held to their session's job by validation (job_id_mismatch): an archival never
// strands an open session.
export function mayRecordLabor(
  scope: PushScope | null,
  user: AppUser,
  workerId: string,
  type: "started" | "paused" | "resumed" | "ended",
): boolean {
  if (scope === null || workerId !== user.id) return false;
  return type !== "started" || !scope.jobArchived;
}
