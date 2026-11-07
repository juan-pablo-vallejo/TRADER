// roster.list (PRD, Target users: the admin keeps the roster). Every user of the caller's
// company, deactivated ones included with their timestamp so the office can reactivate them,
// ordered by name. `invited` is "never signed in" (identity_subject still NULL); the subject
// itself is never output, as me.get never outputs it. A plain read under RLS, no locks.
// Consumed by routers/roster.ts, and by invite.ts, role.ts and deactivation.ts for the row
// they answer with.
import { userRole, users } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";

export const rosterUser = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: z.enum(userRole.enumValues),
  invited: z.boolean(),
  deactivatedAt: z.date().nullable(),
});

export type RosterUser = z.infer<typeof rosterUser>;

export const listOutput = z.array(rosterUser);

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: users.role,
  bound: sql<boolean>`${users.identitySubject} is not null`,
  deactivatedAt: users.deactivatedAt,
};

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: RosterUser["role"];
  bound: boolean;
  deactivatedAt: Date | null;
};

const toUser = (row: Row): RosterUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  invited: !row.bound,
  deactivatedAt: row.deactivatedAt,
});

export async function rosterList(tx: Tx): Promise<RosterUser[]> {
  const rows = await tx
    .select(columns)
    .from(users)
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
  return rows.map(toUser);
}

// One visible user, or undefined: another tenant's row is invisible under RLS.
export async function readRosterUser(
  tx: Tx,
  id: string,
): Promise<RosterUser | undefined> {
  const [row] = await tx.select(columns).from(users).where(eq(users.id, id));
  return row === undefined ? undefined : toUser(row);
}
