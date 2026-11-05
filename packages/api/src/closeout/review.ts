// closeout.review (PRD, Day closeout: the foreman reviews the day's labor and materials): one
// job's day as the server derives it, with the fingerprint closeout.submit checks. A read: no
// field-write lock and no writes. The scope rows are held FOR SHARE to the call's end, so the
// caller's authority, the job's status and the zone hold for the read; the labor and materials
// may combine committed states from different moments (day.ts), which only ever makes a
// fingerprint mismatch at submit, never a false match. Workers are those with a session on the
// day; no cost, no approval state. An existing closeout is flagged; the content stays the live
// derivation, not the day as submitted. Consumed by routers/closeout.ts.
import { dayCloseouts, users } from "@trader/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../context";
import type { AppUser } from "../resolve-user";
import { gatherJobDay } from "./day";
import { reviewFingerprint } from "./fingerprint";
import { lockForemanScope } from "./scope";

export const reviewInput = z.strictObject({
  jobId: z.uuid(),
  workDate: z.iso.date(),
});

export type ReviewInput = z.infer<typeof reviewInput>;

const session = z.strictObject({
  rootEventId: z.uuid(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  state: z.enum(["working", "paused", "ended"]),
  complete: z.boolean(),
  voided: z.boolean(),
  corrected: z.boolean(),
  workedMs: z.number().int(),
  breakMs: z.number().int(),
  elapsedMs: z.number().int().nullable(),
});

export const reviewOutput = z.strictObject({
  jobId: z.uuid(),
  workDate: z.iso.date(),
  timeZone: z.string(),
  job: z.strictObject({
    name: z.string(),
    status: z.enum(["open", "complete", "archived"]),
  }),
  closeout: z.strictObject({ id: z.uuid(), serverTimestamp: z.date() }).nullable(),
  workers: z.array(
    z.strictObject({ workerId: z.uuid(), name: z.string(), sessions: z.array(session) }),
  ),
  materials: z.array(
    z.strictObject({
      id: z.uuid(),
      description: z.string(),
      quantity: z.string(),
      unit: z.string(),
      loggedAt: z.date(),
      loggedByUserId: z.uuid(),
      loggedByName: z.string(),
    }),
  ),
  fingerprint: z.string(),
});

export type Review = z.infer<typeof reviewOutput>;

export async function reviewDay(
  tx: Tx,
  user: AppUser,
  input: ReviewInput,
): Promise<Review> {
  const scope = await lockForemanScope(tx, user, input.jobId, "share");
  const { timeZone } = scope;

  const day = await gatherJobDay(tx, {
    jobId: input.jobId,
    workDate: input.workDate,
    timeZone,
  });

  const [closeout] = await tx
    .select({ id: dayCloseouts.id, serverTimestamp: dayCloseouts.serverTimestamp })
    .from(dayCloseouts)
    .where(
      and(eq(dayCloseouts.jobId, input.jobId), eq(dayCloseouts.workDate, input.workDate)),
    );

  const people = [
    ...new Set([
      ...day.workers.map((w) => w.workerId),
      ...day.materials.map((m) => m.loggedByUserId),
    ]),
  ];
  const names = new Map(
    people.length === 0
      ? []
      : (
          await tx
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, people))
        ).map((u) => [u.id, u.name]),
  );
  const nameOf = (id: string) => {
    const name = names.get(id);
    if (name === undefined) throw new Error("a person on the day is not visible");
    return name;
  };

  return {
    jobId: input.jobId,
    workDate: input.workDate,
    timeZone,
    job: { name: scope.jobName, status: scope.jobStatus },
    closeout: closeout ?? null,
    // day.workers is in id order; each worker's sessions keep the fold's order.
    workers: day.workers.map(({ workerId }) => ({
      workerId,
      name: nameOf(workerId),
      sessions: day.sessions
        .filter((s) => s.workerId === workerId)
        .map(({ session: s, corrected }) => ({
          rootEventId: s.rootEventId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          state: s.state,
          complete: s.complete,
          voided: s.voided,
          corrected,
          workedMs: s.workedMs,
          breakMs: s.breakMs,
          elapsedMs: s.elapsedMs,
        })),
    })),
    materials: day.materials.map((m) => ({
      id: m.id,
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      loggedAt: m.loggedAt,
      loggedByUserId: m.loggedByUserId,
      loggedByName: nameOf(m.loggedByUserId),
    })),
    fingerprint: reviewFingerprint({
      companyId: user.companyId,
      jobId: input.jobId,
      workDate: input.workDate,
      timeZone,
      jobStatus: scope.jobStatus,
      sessions: day.sessions,
      materials: day.materials,
    }),
  };
}
