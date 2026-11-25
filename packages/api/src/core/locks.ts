// The caller, re-read under a lock held to commit: resolution read it without one. A
// deactivated caller is UNAUTHORIZED, as at resolution; a changed role is FORBIDDEN. Users
// come after jobs and customers in the global lock order, so a writer takes its entity locks
// first and this last.
import { users } from "@trader/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

import type { Tx } from "./context";
import type { AppUser } from "./resolve-user";
import { forbidden, unauthorized } from "./trpc";

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

type LockedUser = {
  id: string;
  name: string;
  deactivatedAt: Date | null;
};

// The caller and the target users, FOR SHARE in id order, one statement. A deactivated caller
// is UNAUTHORIZED, one who is no longer an admin FORBIDDEN; a target that is missing or
// another tenant's is FORBIDDEN. Returns the targets by id.
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
