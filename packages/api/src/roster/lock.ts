// The roster writers' lock (ARCHITECTURE, roster API): the caller, the target and every active
// admin of the company, in one statement, FOR NO KEY UPDATE in id order — the global order
// puts users rows in id order, and two statements (the caller first, then the rest) would
// deadlock two admins demoting each other. The rows come back re-read under locks held to
// commit, so the caller is judged as lockActiveSelf judges it and the last-admin rule is judged
// on committed state: a second admin's statement waits here and re-evaluates its WHERE on the
// first one's commit. Reads and writes users only. Consumed by role.ts and deactivation.ts.
import { users } from "@trader/db/schema";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { forbidden, unauthorized } from "../core/trpc";

export type LockedTarget = {
  id: string;
  role: AppUser["role"];
  deactivatedAt: Date | null;
};

export type RosterLock = {
  target: LockedTarget;
  // Active admins other than the target, as locked. Zero means the target is the last one.
  otherActiveAdmins: number;
};

export async function lockRosterRows(
  tx: Tx,
  user: AppUser,
  targetId: string,
): Promise<RosterLock> {
  const rows = await tx
    .select({ id: users.id, role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(
      or(
        eq(users.id, user.id),
        eq(users.id, targetId),
        and(eq(users.role, "admin"), isNull(users.deactivatedAt)),
      ),
    )
    .orderBy(asc(users.id))
    .for("no key update");

  const caller = rows.find((r) => r.id === user.id);
  if (caller === undefined || caller.deactivatedAt !== null) throw unauthorized();
  if (caller.role !== "admin") throw forbidden();

  // A missing id and another tenant's (invisible under RLS) are one answer.
  const target = rows.find((r) => r.id === targetId);
  if (target === undefined) throw forbidden();

  const otherActiveAdmins = rows.filter(
    (r) => r.id !== targetId && r.role === "admin" && r.deactivatedAt === null,
  ).length;
  return { target, otherActiveAdmins };
}

export const isActiveAdmin = (row: LockedTarget) =>
  row.role === "admin" && row.deactivatedAt === null;
