// Identity → user row, select-first, on the caller's transaction (ARCHITECTURE invariant 6).
// Runs with the identity settings set and the tenant unset, so only 0015's two policies
// apply: the caller sees its own bound row, or unbound invitations to its verified email.
// First sign-in binds the one invitation; nothing is ever inserted, and nothing but
// identity_subject is ever written (users_identity_guard refuses anything else).
import { users } from "@trader/db/schema";
import { and, DrizzleQueryError, eq, isNull, sql } from "drizzle-orm";

import type { Tx } from "./context";
import type { VerifiedIdentity } from "./identity";

const columns = {
  id: users.id,
  companyId: users.companyId,
  role: users.role,
  name: users.name,
  email: users.email,
  phone: users.phone,
  identitySubject: users.identitySubject,
  deactivatedAt: users.deactivatedAt,
};

type Row = Pick<typeof users.$inferSelect, keyof typeof columns>;

export type AppUser = Omit<Row, "identitySubject" | "deactivatedAt">;

// One login bound to a second row: a concurrent bind of the same subject elsewhere won. The
// only database error that resolution recognizes; trpc.ts turns it into UNAUTHORIZED after the
// transaction has rolled back. Anything else is a defect and stays an internal error.
export class BindConflict extends Error {}

const IDENTITY_SUBJECT_UNIQUE = "users_identity_subject_unique";

const active = (row: Row): AppUser | null =>
  row.deactivatedAt === null
    ? {
        id: row.id,
        companyId: row.companyId,
        role: row.role,
        name: row.name,
        email: row.email,
        phone: row.phone,
      }
    : null;

async function bySubject(tx: Tx, subject: string) {
  const [row] = await tx
    .select(columns)
    .from(users)
    .where(eq(users.identitySubject, subject));
  return row;
}

export async function resolveUser(
  tx: Tx,
  identity: VerifiedIdentity,
): Promise<AppUser | null> {
  // 1. Every request after the first. Deactivated resolves to no user (TASKS, Stage 3).
  const bound = await bySubject(tx, identity.subject);
  if (bound !== undefined) return active(bound);

  // 2. First sign-in: unbound invitations to this email, in every company. Anything but
  //    exactly one fails closed; deactivated invitations count, so ambiguity is judged
  //    conservatively, and a deactivated one is never bound.
  const invitations = await tx
    .select(columns)
    .from(users)
    .where(
      and(
        isNull(users.identitySubject),
        sql`lower(${users.email}) = lower(${identity.email})`,
      ),
    );
  const [invitation] = invitations;
  if (invitations.length !== 1 || invitation === undefined) return null;
  if (invitation.deactivatedAt !== null) return null;

  // 3. Bind. The WHERE is re-checked after any row lock (READ COMMITTED), so a concurrent bind
  //    or deactivation makes this match nothing rather than overwrite it.
  let updated;
  try {
    updated = await tx
      .update(users)
      .set({ identitySubject: identity.subject })
      .where(
        and(
          eq(users.id, invitation.id),
          isNull(users.identitySubject),
          isNull(users.deactivatedAt),
        ),
      )
      .returning(columns);
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : undefined;
    const pg = cause as { code?: string; constraint?: string } | undefined;
    if (pg?.code === "23505" && pg.constraint === IDENTITY_SUBJECT_UNIQUE) {
      throw new BindConflict("identity subject already bound", { cause: error });
    }
    throw error;
  }
  const [row] = updated;
  if (row !== undefined) {
    return row.identitySubject === identity.subject ? active(row) : null;
  }

  // 4. Matched nothing: a concurrent first sign-in of the same subject bound it (use that
  //    row), or the invitation was bound to another login or deactivated (no user).
  const raced = await bySubject(tx, identity.subject);
  return raced === undefined ? null : active(raced);
}
