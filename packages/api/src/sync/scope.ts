// Who may push a record, judged at receipt from rows read in the record's own transaction
// (ARCHITECTURE, push authority of 2026-11-05). The order is the global one (row 193, as
// extended): the job, then its crew, both FOR SHARE; crew_members read without a lock, because
// trader_app holds no UPDATE on it (0013) and FOR SHARE needs one. The crew row's lock is what
// holds membership still: every writer that adds or removes a member locks that row FOR NO
// KEY UPDATE first (ARCHITECTURE, crew membership writers), so a removal waits for this push
// to commit and never lands under a push that relied on it; then the users
// rows FOR SHARE in id order, so two pushes never wait on each other's in opposite orders. A
// caller deactivated meanwhile is UNAUTHORIZED, as at resolution; every other refusal is one
// `not_permitted` that says nothing of which check failed. Consumed by sync/labor.ts and
// sync/material.ts.
import { crewMembers, crews, jobs, users } from "@trader/db/schema";
import { and, eq, inArray } from "drizzle-orm";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { unauthorized } from "../core/trpc";
import type { JobPlace } from "./reasons";

export type PushScope = {
  // The caller's role as locked now, never the resolved one: a demotion committed since the
  // record's resolution is seen.
  role: AppUser["role"];
  jobArchived: boolean;
  place: JobPlace;
  // The job's crew, active; null when unstaffed or the crew is deactivated.
  crew: { foremanUserId: string; members: Set<string> } | null;
  // Whether the worker named by the record exists in the tenant and is active.
  workerActive: boolean;
};

export async function lockPushScope(
  tx: Tx,
  user: AppUser,
  jobId: string,
  workerId: string,
): Promise<PushScope | null> {
  const [job] = await tx
    .select({
      crewId: jobs.crewId,
      status: jobs.status,
      lat: jobs.locationLat,
      lng: jobs.locationLng,
      radiusM: jobs.locationRadiusM,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .for("share");
  // Invisible (another tenant's, under RLS) or missing: nothing to say about it.
  if (job === undefined) {
    await lockSelves(tx, user, workerId);
    return null;
  }

  let crew: PushScope["crew"] = null;
  if (job.crewId !== null) {
    const [row] = await tx
      .select({ foremanUserId: crews.foremanUserId, deactivatedAt: crews.deactivatedAt })
      .from(crews)
      .where(eq(crews.id, job.crewId))
      .for("share");
    if (row !== undefined && row.deactivatedAt === null) {
      const rows = await tx
        .select({ userId: crewMembers.userId })
        .from(crewMembers)
        .where(
          and(
            eq(crewMembers.crewId, job.crewId),
            inArray(crewMembers.userId, [user.id, workerId]),
          ),
        );
      crew = {
        foremanUserId: row.foremanUserId,
        members: new Set(rows.map((r) => r.userId)),
      };
    }
  }

  const selves = await lockSelves(tx, user, workerId);
  const place =
    job.lat !== null && job.lng !== null && job.radiusM !== null
      ? { lat: job.lat, lng: job.lng, radiusM: job.radiusM }
      : null;
  return {
    role: selves.role,
    jobArchived: job.status === "archived",
    place,
    crew,
    workerActive: selves.workerActive,
  };
}

// The caller and the worker, FOR SHARE in id order.
async function lockSelves(tx: Tx, user: AppUser, workerId: string) {
  const ids = [...new Set([user.id, workerId])].sort();
  const rows = await tx
    .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(users.id)
    .for("share");
  const self = rows.find((r) => r.id === user.id);
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  const worker = rows.find((r) => r.id === workerId);
  return {
    role: self.role,
    workerActive: worker !== undefined && worker.deactivatedAt === null,
  };
}

// A `started`, or a receipt, needs a job the caller may work on: not archived, and of an
// active crew the caller is in or leads (a lead counts without a member row: crews.ts), or any
// job for an admin.
function mayStartOn(scope: PushScope, user: AppUser): boolean {
  if (scope.jobArchived) return false;
  if (scope.role === "admin") return true;
  return (
    scope.crew !== null &&
    (scope.crew.members.has(user.id) || scope.crew.foremanUserId === user.id)
  );
}

export function mayRecordLabor(
  scope: PushScope | null,
  user: AppUser,
  workerId: string,
  type: "started" | "paused" | "resumed" | "ended",
): boolean {
  if (scope === null) return false;
  if (workerId === user.id) {
    // Pause, resume and end are held to their session's job by validation (job_id_mismatch):
    // a reassignment or an archival never strands an open session.
    return type !== "started" || mayStartOn(scope, user);
  }
  // Crew labor: the foreman of the job's active crew, for a current active member, every type.
  return (
    scope.role === "foreman" &&
    scope.crew !== null &&
    scope.crew.foremanUserId === user.id &&
    scope.crew.members.has(workerId) &&
    scope.workerActive &&
    (type !== "started" || !scope.jobArchived)
  );
}

export function mayLogReceipt(scope: PushScope | null, user: AppUser): boolean {
  return scope !== null && mayStartOn(scope, user);
}
