// The crew writers' locks (ARCHITECTURE, customers, jobs and crews API; crew membership
// writers of 2026-11-05). A crew or membership write holds the crew row FOR NO KEY UPDATE,
// which conflicts with the FOR SHARE every push takes on it (sync/scope.ts): the write queues
// behind any push that relied on the membership it changes and commits only after that push
// ends, and a push arriving later waits for the write and reads the new membership. A job
// writer holds it FOR SHARE instead, so a crew deactivation waits for it. Users rows come after
// crews in the lock order, so the caller and any target user are locked FOR SHARE in one
// statement in id order afterwards, the caller judged as lockActiveSelf judges. Consumed by
// write.ts and members.ts; `lockCrewShare` by jobs/write.ts.
import { crews, users } from "@trader/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

import type { Tx } from "../context";
import type { AppUser } from "../resolve-user";
import { forbidden, unauthorized } from "../trpc";

export type LockedCrew = {
  id: string;
  name: string;
  foremanUserId: string;
  deactivatedAt: Date | null;
};

async function lockCrew(
  tx: Tx,
  crewId: string,
  mode: "no key update" | "share",
): Promise<LockedCrew> {
  const [row] = await tx
    .select({
      id: crews.id,
      name: crews.name,
      foremanUserId: crews.foremanUserId,
      deactivatedAt: crews.deactivatedAt,
    })
    .from(crews)
    .where(eq(crews.id, crewId))
    .for(mode);
  // A missing id and another tenant's (invisible under RLS) are one answer.
  if (row === undefined) throw forbidden();
  return row;
}

export const lockCrewForWrite = (tx: Tx, crewId: string) =>
  lockCrew(tx, crewId, "no key update");

export const lockCrewShare = (tx: Tx, crewId: string) => lockCrew(tx, crewId, "share");

export type LockedUser = {
  id: string;
  name: string;
  role: AppUser["role"];
  deactivatedAt: Date | null;
};

// The caller and the target users, FOR SHARE in id order, one statement. A deactivated caller
// is UNAUTHORIZED, a demoted one FORBIDDEN; a target that is missing or another tenant's is
// FORBIDDEN. Returns the targets by id.
export async function lockUsersShare(
  tx: Tx,
  user: AppUser,
  targetIds: string[],
): Promise<Map<string, LockedUser>> {
  const ids = [...new Set([user.id, ...targetIds])].sort();
  const rows = await tx
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      deactivatedAt: users.deactivatedAt,
    })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(asc(users.id))
    .for("share");
  const self = rows.find((r) => r.id === user.id);
  if (self === undefined || self.deactivatedAt !== null) throw unauthorized();
  if (self.role !== "admin") throw forbidden();
  const targets = new Map(rows.map((r) => [r.id, r]));
  for (const id of targetIds) if (!targets.has(id)) throw forbidden();
  return targets;
}
