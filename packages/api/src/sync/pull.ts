// sync.pull (ARCHITECTURE, Sync protocol; sync.pull of 2026-11-05): a per-user snapshot of the
// caller's own entries and the reference data the push admits, never anyone else's labor or
// receipts. Devices hold only their user's own entries offline; crew views are online-only
// (PRD, Sync and offline). One protected transaction; under READ COMMITTED each statement reads
// its own committed state, so the snapshot may combine moments, as closeout.review does, and
// the next pull converges. Consumed by routers/sync.ts.
import {
  approvals,
  companies,
  crewMembers,
  crews,
  jobs,
  materialCorrections,
  materials,
  users,
} from "@trader/db/schema";
import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import { replay } from "../labor/fold";
import { readWorkerEvents } from "../labor/timeline";
import { deriveSessions, workDate } from "../labor/work-date";
import { effectiveMaterial } from "../materials/effective";
import type { AppUser } from "../core/resolve-user";
import { SYNC_PROTOCOL_VERSIONS } from "./protocol";

// ARCHITECTURE, sync.pull: today and the 13 days before it in the company's zone, plus any
// open session whatever its age.
export const WINDOW_DAYS = 14;

export const pullInput = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSIONS),
});

const approvalState = z.enum(["none", "pending", "approved", "rejected"]);
const facts = z.strictObject({
  description: z.string(),
  quantity: z.string(),
  unit: z.string(),
});

export const pullOutput = z.strictObject({
  serverNow: z.date(),
  me: z.strictObject({
    id: z.uuid(),
    role: z.enum(["admin", "foreman", "worker"]),
    name: z.string(),
  }),
  company: z.strictObject({ name: z.string(), timezone: z.string() }),
  // What the caller may start on or log against (sync/scope.ts): no place, customer or cost.
  jobs: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      status: z.enum(["open", "complete", "archived"]),
    }),
  ),
  // Crews the caller leads, with their active members by id and name: what recording crew
  // labor offline needs, and nothing more. A worker gets none.
  ledCrews: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      members: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
    }),
  ),
  sessions: z.array(
    z.strictObject({
      rootEventId: z.uuid(),
      jobId: z.uuid(),
      workDate: z.iso.date(),
      startedAt: z.date(),
      endedAt: z.date().nullable(),
      state: z.enum(["working", "paused", "ended"]),
      workedMs: z.number().int(),
      breakMs: z.number().int(),
      voided: z.boolean(),
    }),
  ),
  // The caller's own events of those sessions, whoever recorded them. No location.
  events: z.array(
    z.strictObject({
      id: z.uuid(),
      type: z.enum(["started", "paused", "resumed", "ended", "voided"]),
      jobId: z.uuid(),
      clientTimestamp: z.date(),
      serverTimestamp: z.date(),
      clockSkewed: z.boolean(),
      correctsEventId: z.uuid().nullable(),
      voidsEventId: z.uuid().nullable(),
      approval: approvalState,
    }),
  ),
  // The caller's own receipts in the window: as logged, and as in effect with approved
  // corrections. No cost, no corrector.
  materials: z.array(
    z.strictObject({
      id: z.uuid(),
      jobId: z.uuid(),
      loggedAt: z.date(),
      original: facts,
      effective: facts.extend({ voided: z.boolean() }),
      correctionPending: z.boolean(),
      approval: approvalState,
    }),
  ),
});

export type PullOutput = z.infer<typeof pullOutput>;

const stateOf = (decision: "approved" | "rejected" | null | undefined) =>
  decision === undefined ? "none" : decision === null ? "pending" : decision;

// YYYY-MM-DD minus `days`, on the calendar (no zone: a date is a date).
function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function pullSnapshot(tx: Tx, user: AppUser): Promise<PullOutput> {
  const serverNow = new Date();
  const [company] = await tx
    .select({ name: companies.name, timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (company === undefined) throw new Error("the caller's company is not visible");
  const from = daysBefore(workDate(serverNow, company.timezone), WINDOW_DAYS - 1);

  // Crews the caller is in or leads, active.
  const memberOf = tx
    .select({ crewId: crewMembers.crewId })
    .from(crewMembers)
    .where(eq(crewMembers.userId, user.id));
  const myCrews = await tx
    .select({ id: crews.id, name: crews.name, foremanUserId: crews.foremanUserId })
    .from(crews)
    .where(
      and(
        isNull(crews.deactivatedAt),
        or(eq(crews.foremanUserId, user.id), inArray(crews.id, memberOf)),
      ),
    )
    .orderBy(asc(crews.id));

  const jobColumns = {
    id: jobs.id,
    name: jobs.name,
    address: jobs.address,
    status: jobs.status,
  };
  const notArchived = ne(jobs.status, "archived");
  const crewIds = myCrews.map((c) => c.id);
  const jobRows =
    user.role === "admin"
      ? await tx.select(jobColumns).from(jobs).where(notArchived).orderBy(asc(jobs.id))
      : crewIds.length === 0
        ? []
        : await tx
            .select(jobColumns)
            .from(jobs)
            .where(and(notArchived, inArray(jobs.crewId, crewIds)))
            .orderBy(asc(jobs.id));

  // Led crews need the foreman role as well as the pointer: a foreman demoted by the roster
  // keeps the pointer until the office changes it (ARCHITECTURE, crew membership lifecycle)
  // and must stop receiving member names at once.
  const led =
    user.role === "foreman" ? myCrews.filter((c) => c.foremanUserId === user.id) : [];
  const memberRows =
    led.length === 0
      ? []
      : await tx
          .select({ crewId: crewMembers.crewId, id: users.id, name: users.name })
          .from(crewMembers)
          .innerJoin(users, eq(users.id, crewMembers.userId))
          .where(
            and(
              inArray(
                crewMembers.crewId,
                led.map((c) => c.id),
              ),
              isNull(users.deactivatedAt),
            ),
          )
          .orderBy(asc(users.id));
  const ledCrews = led.map((c) => ({
    id: c.id,
    name: c.name,
    members: memberRows
      .filter((m) => m.crewId === c.id)
      .map((m) => ({ id: m.id, name: m.name })),
  }));

  // The caller's labor, folded whole (the fold needs the whole ledger), then windowed.
  const ledger = await readWorkerEvents(tx, user.id);
  const kept = deriveSessions(ledger, company.timezone).filter(
    (s) => !s.complete || s.workDate >= from,
  );
  const sessionRoots = new Set(kept.map((s) => s.rootEventId));
  const { winners, sessionOf } = replay(ledger);
  const roots = new Set(
    [...winners]
      .filter(([, source]) => sessionRoots.has(sessionOf.get(source) ?? ""))
      .map(([root]) => root),
  );
  const ownEvents = ledger.filter(
    (e) =>
      roots.has(e.id) ||
      (e.correctsEventId !== null && roots.has(e.correctsEventId)) ||
      (e.voidsEventId !== null && sessionRoots.has(e.voidsEventId)),
  );
  const eventApprovals =
    ownEvents.length === 0
      ? []
      : await tx
          .select({ eventId: approvals.eventId, decision: approvals.decision })
          .from(approvals)
          .where(
            inArray(
              approvals.eventId,
              ownEvents.map((e) => e.id),
            ),
          );
  const eventDecision = new Map(eventApprovals.map((a) => [a.eventId, a.decision]));

  // The caller's receipts in the window: logged on or after its first midnight in the zone,
  // which Postgres finds through the zone's rules (as closeout/day.ts does).
  const fromInstant = sql`(${from}::date::timestamp at time zone ${company.timezone})`;
  const receipts = await tx
    .select({
      id: materials.id,
      jobId: materials.jobId,
      loggedAt: materials.loggedAt,
      description: materials.description,
      quantity: materials.quantity,
      unit: materials.unit,
    })
    .from(materials)
    .where(
      and(eq(materials.loggedByUserId, user.id), gte(materials.loggedAt, fromInstant)),
    )
    .orderBy(asc(materials.loggedAt), asc(materials.id));
  const receiptIds = receipts.map((r) => r.id);
  const corrections =
    receiptIds.length === 0
      ? []
      : await tx
          .select({
            materialId: materialCorrections.materialId,
            id: materialCorrections.id,
            kind: materialCorrections.kind,
            description: materialCorrections.description,
            quantity: materialCorrections.quantity,
            unit: materialCorrections.unit,
            serverTimestamp: materialCorrections.serverTimestamp,
            decision: approvals.decision,
          })
          .from(materialCorrections)
          .leftJoin(approvals, eq(approvals.materialCorrectionId, materialCorrections.id))
          .where(inArray(materialCorrections.materialId, receiptIds));
  const receiptApprovals =
    receiptIds.length === 0
      ? []
      : await tx
          .select({ materialId: approvals.materialId, decision: approvals.decision })
          .from(approvals)
          .where(inArray(approvals.materialId, receiptIds));
  const receiptDecision = new Map(
    receiptApprovals.map((a) => [a.materialId, a.decision]),
  );

  return {
    serverNow,
    me: { id: user.id, role: user.role, name: user.name },
    company,
    jobs: jobRows,
    ledCrews,
    sessions: kept.map((s) => ({
      rootEventId: s.rootEventId,
      jobId: s.jobId,
      workDate: s.workDate,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      state: s.state,
      workedMs: s.workedMs,
      breakMs: s.breakMs,
      voided: s.voided,
    })),
    events: ownEvents.map((e) => ({
      id: e.id,
      type: e.type,
      jobId: e.jobId,
      clientTimestamp: e.clientTimestamp,
      serverTimestamp: e.serverTimestamp,
      clockSkewed: e.clockSkewed,
      correctsEventId: e.correctsEventId,
      voidsEventId: e.voidsEventId,
      approval: stateOf(eventDecision.get(e.id)),
    })),
    materials: receipts.map((r) => {
      const effective = effectiveMaterial(
        r,
        corrections.filter((c) => c.materialId === r.id),
      );
      return {
        id: r.id,
        jobId: r.jobId,
        loggedAt: r.loggedAt,
        original: { description: r.description, quantity: r.quantity, unit: r.unit },
        effective: {
          description: effective.description,
          quantity: effective.quantity,
          unit: effective.unit,
          voided: effective.voided,
        },
        correctionPending: effective.pendingId !== null,
        approval: stateOf(receiptDecision.get(r.id)),
      };
    }),
  };
}
