// What a pull answers: the caller's own snapshot (ARCHITECTURE, sync.pull). Part of the
// client-safe contract: the phone parses what it stored with the schema the server answers
// with.
import { z } from "zod";

import { APPROVAL_REASONS, JOB_STATUSES, LABOR_EVENT_TYPES, ROLES } from "./enums";
import { SYNC_PROTOCOL_VERSIONS } from "./protocol";

export const pullInput = z.strictObject({
  protocolVersion: z.literal(SYNC_PROTOCOL_VERSIONS),
});

// A time of day on the company's wall clock, `HH:MM`.
const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const pullOutput = z.strictObject({
  serverNow: z.date(),
  me: z.strictObject({
    id: z.uuid(),
    role: z.enum(ROLES),
    name: z.string(),
  }),
  company: z.strictObject({ name: z.string(), timezone: z.string() }),
  // Whether a clock-in is judged by the weekly schedule (sync/schedule.ts). The phone shows
  // what follows from it; the server alone decides.
  scheduleEnforced: z.boolean(),
  // The caller's own shifts, from the Monday of the company's current week for fourteen days
  // each with its jobsite. Nobody else's shift.
  shifts: z.array(
    z.strictObject({
      id: z.uuid(),
      workDate: z.iso.date(),
      start: wallTime,
      end: wallTime,
      job: z.strictObject({
        id: z.uuid(),
        name: z.string(),
        address: z.string().nullable(),
      }),
      locked: z.boolean(),
    }),
  ),
  // What the caller may start on or log against (sync/scope.ts): no place, customer or cost.
  jobs: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      status: z.enum(JOB_STATUSES),
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
      type: z.enum(LABOR_EVENT_TYPES),
      jobId: z.uuid(),
      clientTimestamp: z.date(),
      serverTimestamp: z.date(),
      clockSkewed: z.boolean(),
      correctsEventId: z.uuid().nullable(),
      voidsEventId: z.uuid().nullable(),
      // Why the office may look at the entry. It counts whatever it holds.
      flags: z.array(z.enum(APPROVAL_REASONS)),
    }),
  ),
});

export type PullOutput = z.infer<typeof pullOutput>;
