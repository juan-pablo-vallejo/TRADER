// crew.list (PRD, Jobs and location: a crew has a foreman; jobs are assigned to a crew). Every
// crew of the caller's company with its foreman, its members and the count of its jobs not yet
// archived, deactivated crews included with their timestamp. `foreman.available` is derived: the
// pointed-at user is active and still holds the foreman role — the roster may have deactivated
// or demoted them since (ARCHITECTURE, crew membership lifecycle), and the office then changes
// the foreman. Members carry their own state; a deactivated member keeps its row. A plain read
// under RLS, no locks. Consumed by routers/crew.ts and by write.ts and members.ts for the row
// each writer answers with.
import { crewMembers, crews, userRole, users } from "@trader/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";

export const crew = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  foreman: z.strictObject({ id: z.uuid(), name: z.string(), available: z.boolean() }),
  members: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      role: z.enum(userRole.enumValues),
      deactivatedAt: z.date().nullable(),
    }),
  ),
  // Jobs on this crew whose status is not `archived`: zero is what `deactivate` requires.
  jobCount: z.number().int(),
  deactivatedAt: z.date().nullable(),
});

export type Crew = z.infer<typeof crew>;

export const listOutput = z.array(crew);

// The outer table named in full: Drizzle renders a column reference bare inside a select, and
// the subquery would resolve it against jobs. `archived` was created with the type (0000).
const columns = {
  id: crews.id,
  name: crews.name,
  foremanId: crews.foremanUserId,
  foremanName: users.name,
  foremanRole: users.role,
  foremanDeactivatedAt: users.deactivatedAt,
  jobCount: sql<number>`(
    select count(*)::int from jobs j where j.crew_id = crews.id and j.status <> 'archived'
  )`,
  deactivatedAt: crews.deactivatedAt,
};

type Row = {
  id: string;
  name: string;
  foremanId: string;
  foremanName: string;
  foremanRole: Crew["members"][number]["role"];
  foremanDeactivatedAt: Date | null;
  jobCount: number;
  deactivatedAt: Date | null;
};

async function membersOf(
  tx: Tx,
  crewIds: string[],
): Promise<Map<string, Crew["members"]>> {
  const result = new Map<string, Crew["members"]>(crewIds.map((id) => [id, []]));
  if (crewIds.length === 0) return result;
  const rows = await tx
    .select({
      crewId: crewMembers.crewId,
      id: users.id,
      name: users.name,
      role: users.role,
      deactivatedAt: users.deactivatedAt,
    })
    .from(crewMembers)
    .innerJoin(users, eq(users.id, crewMembers.userId))
    .where(inArray(crewMembers.crewId, crewIds))
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
  for (const { crewId, ...member } of rows) result.get(crewId)?.push(member);
  return result;
}

const toCrew = (row: Row, members: Crew["members"]): Crew => ({
  id: row.id,
  name: row.name,
  foreman: {
    id: row.foremanId,
    name: row.foremanName,
    available: row.foremanDeactivatedAt === null && row.foremanRole === "foreman",
  },
  members,
  jobCount: row.jobCount,
  deactivatedAt: row.deactivatedAt,
});

export async function listCrews(tx: Tx): Promise<Crew[]> {
  const rows = await tx
    .select(columns)
    .from(crews)
    .innerJoin(users, eq(users.id, crews.foremanUserId))
    .orderBy(asc(sql`lower(${crews.name})`), asc(crews.id));
  const members = await membersOf(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toCrew(row, members.get(row.id) ?? []));
}

// One visible crew, or undefined: another tenant's row is invisible under RLS.
export async function readCrew(tx: Tx, id: string): Promise<Crew | undefined> {
  const [row] = await tx
    .select(columns)
    .from(crews)
    .innerJoin(users, eq(users.id, crews.foremanUserId))
    .where(eq(crews.id, id));
  if (row === undefined) return undefined;
  return toCrew(row, (await membersOf(tx, [id])).get(id) ?? []);
}
