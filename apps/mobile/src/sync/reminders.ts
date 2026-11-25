// Shift reminders: the notifications the phone schedules for itself, decided whole from the
// shifts in the last pull, the clock's state and the time. Pure: no notification is touched
// here (ui/reminders.ts does that with what this answers). No server, no push token, no
// location in the background: the phone's own alarm, set from what it already holds.
//
// Two kinds. At a shift's start, when nobody has clocked in on it. At a shift's end, while
// the clock is still running on its job. The set is decided again after every pull and
// every tap, so a clock-in takes the start reminder away and puts the end one in its place,
// and a clock-out takes that away too.
import { instantNear, wallClock } from "@trader/api/contract";
import type { PullOutput } from "@trader/api/contract";

import type { ClockState } from "./clock";

type Shift = PullOutput["shifts"][number];

type Reminder = {
  // Stable for one shift and one kind at one time: scheduling the same set twice changes
  // nothing, and a shift whose time the office moved is a different reminder.
  id: string;
  kind: "start" | "end";
  at: Date;
  shiftId: string;
  jobName: string;
  // The shift's own wall-clock time, `HH:MM`, for the sentence.
  wall: string;
  // Its time has come, within the last few minutes. No exact-alarm permission is asked
  // for, so the phone may deliver a reminder a little late: one that is due is left
  // pending and never set again (reconcile below). Without this the next pull would cancel
  // a reminder the phone was about to show (seen on Android, 2026-11-19).
  due: boolean;
};

// How long after its time a reminder is still left for the phone to deliver.
const LATE_MS = 15 * 60_000;

// iOS keeps 64 pending notifications for an app and silently drops the rest. Two weeks of
// shifts is far under it; the cap is here so a strange schedule cannot starve the nearest.
export const MAX_REMINDERS = 40;

const idOf = (kind: Reminder["kind"], shift: Shift, at: Date) =>
  `shift-${kind}:${shift.id}:${String(at.getTime())}`;

export function reminders(input: {
  // Off in Me, or the permission never given: nothing is scheduled at all.
  enabled: boolean;
  shifts: readonly Shift[];
  clock: ClockState;
  timeZone: string;
  now: number;
}): Reminder[] {
  if (!input.enabled) return [];
  const { clock, timeZone, now } = input;
  const today = wallClock(new Date(now), timeZone).day;
  const out: Reminder[] = [];
  for (const shift of input.shifts) {
    const start = instantNear(shift.workDate, shift.start, timeZone);
    const end = instantNear(shift.workDate, shift.end, timeZone);
    // On the clock on this shift's job, today, before it ends: this is the shift being
    // worked, whether the clock-in came early, on time or late.
    const working =
      clock.status !== "off" &&
      clock.jobId === shift.job.id &&
      shift.workDate === today &&
      end.getTime() > now - LATE_MS;
    if (working) {
      out.push({
        id: idOf("end", shift, end),
        kind: "end",
        at: end,
        shiftId: shift.id,
        jobName: shift.job.name,
        wall: shift.end,
        due: end.getTime() <= now,
      });
      continue;
    }
    // Somebody clocked in on it already (the server locked it), or its start is well
    // past: there is nothing left to remind of.
    if (shift.locked || start.getTime() <= now - LATE_MS) continue;
    out.push({
      id: idOf("start", shift, start),
      kind: "start",
      at: start,
      shiftId: shift.id,
      jobName: shift.job.name,
      wall: shift.start,
      due: start.getTime() <= now,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}

// What to change so the phone's pending reminders are exactly `wanted`: ours that are no
// longer wanted go, wanted ones not yet pending are added, and the rest are left alone.
// `pending` is every identifier the phone holds; only those that are ours are judged. A
// due reminder is kept while it is pending and never set anew: once the phone has shown
// it, it is no longer pending, and setting it again would show it again.
export function reconcile(
  pending: readonly string[],
  wanted: readonly Reminder[],
): { cancel: string[]; schedule: Reminder[] } {
  const ours = pending.filter((id) => id.startsWith("shift-"));
  const want = new Set(wanted.map((r) => r.id));
  const have = new Set(ours);
  return {
    cancel: ours.filter((id) => !want.has(id)),
    schedule: wanted.filter((r) => !r.due && !have.has(r.id)),
  };
}
