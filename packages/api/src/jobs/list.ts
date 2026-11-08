// job.list (PRD, Jobs and location: jobs belong to a customer and are assigned to a crew). Every
// job of the caller's company with its customer, its crew (with whether that crew is active) and
// its location, archived jobs included: the office filters by status. Ordered by status (open,
// complete, archived — the enum's order) then name. A plain read under RLS, no locks. Consumed
// by routers/job.ts and by write.ts for the row each writer answers with.
import { crews, customers, jobStatus, jobs } from "@trader/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";

export const location = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(1),
});

export const job = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  // All three or none (jobs.ts): a job without a location can only flag a missing stamp.
  location: location.nullable(),
  status: z.enum(jobStatus.enumValues),
  customer: z.strictObject({ id: z.uuid(), name: z.string() }),
  // Null when unstaffed. `active` is the crew's own state: a job on a deactivated crew is
  // effectively unstaffed until reassigned.
  crew: z
    .strictObject({ id: z.uuid(), name: z.string(), active: z.boolean() })
    .nullable(),
});

export type Job = z.infer<typeof job>;

export const listOutput = z.array(job);

const columns = {
  id: jobs.id,
  name: jobs.name,
  address: jobs.address,
  lat: jobs.locationLat,
  lng: jobs.locationLng,
  radiusM: jobs.locationRadiusM,
  status: jobs.status,
  customerId: customers.id,
  customerName: customers.name,
  crewId: crews.id,
  crewName: crews.name,
  crewDeactivatedAt: crews.deactivatedAt,
};

type Row = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  status: Job["status"];
  customerId: string;
  customerName: string;
  crewId: string | null;
  crewName: string | null;
  crewDeactivatedAt: Date | null;
};

const toJob = (row: Row): Job => ({
  id: row.id,
  name: row.name,
  address: row.address,
  location:
    row.lat !== null && row.lng !== null && row.radiusM !== null
      ? { lat: row.lat, lng: row.lng, radiusM: row.radiusM }
      : null,
  status: row.status,
  customer: { id: row.customerId, name: row.customerName },
  crew:
    row.crewId !== null && row.crewName !== null
      ? { id: row.crewId, name: row.crewName, active: row.crewDeactivatedAt === null }
      : null,
});

const select = (tx: Tx) =>
  tx
    .select(columns)
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(crews, eq(crews.id, jobs.crewId));

export async function listJobs(tx: Tx): Promise<Job[]> {
  const rows = await select(tx).orderBy(
    asc(jobs.status),
    asc(sql`lower(${jobs.name})`),
    asc(jobs.id),
  );
  return rows.map(toJob);
}

// One visible job, or undefined: another tenant's row is invisible under RLS.
export async function readJob(tx: Tx, id: string): Promise<Job | undefined> {
  const [row] = await select(tx).where(eq(jobs.id, id));
  return row === undefined ? undefined : toJob(row);
}
