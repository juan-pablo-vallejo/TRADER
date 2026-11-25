// What the Crew tab works out from `overview.today`'s answer and the minute. Pure: the
// screen draws what these answer. A person's status is the shared function's
// (`@trader/api/contract`, crewStatus) and is never decided here.
import {
  crewStatus,
  type CrewStatus,
  type PullOutput,
  wallClock,
} from "@trader/api/contract";

import type { Api } from "../api";

export type Crew = Awaited<ReturnType<Api["overview"]["today"]["query"]>>;
export type CrewPerson = Crew["people"][number];
type CrewJob = Crew["jobs"][number];

const QUARTER = 15;
// The last quarter hour of a day, and its last minute: a shift ends the day it starts.
const LAST_QUARTER = 23 * 60 + 45;
const LAST_MINUTE = 23 * 60 + 59;

const minutes = (wall: string) =>
  Number(wall.slice(0, 2)) * 60 + Number(wall.slice(3, 5));
const wall = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

// The quarter hour at or after a minute: where a shift added now starts.
export function quarterAfter(minute: string): string {
  return wall(Math.min(LAST_QUARTER, Math.ceil(minutes(minute) / QUARTER) * QUARTER));
}

// A time moved by quarter hours, kept inside the day and on the quarter-hour grid; the
// day's last minute is the one end off the grid, so a shift can run to midnight.
export function stepTime(time: string, quarters: number): string {
  const from = time === wall(LAST_MINUTE) ? LAST_QUARTER + QUARTER : minutes(time);
  const next = Math.round(from / QUARTER) * QUARTER + quarters * QUARTER;
  if (next > LAST_QUARTER) return wall(LAST_MINUTE);
  return wall(Math.max(0, next));
}

// The end a new shift is offered: the usual end of a day when it starts before that, else
// two hours on, and always after the start.
export function offeredEnd(start: string, usual = "15:30"): string {
  if (start < usual) return usual;
  return wall(Math.min(LAST_MINUTE, minutes(start) + 120));
}

// The shift a minute falls in, start included and end excluded, as the server reads it.
export function coveringShift(
  person: Pick<CrewPerson, "shifts">,
  minute: string,
): CrewPerson["shifts"][number] | null {
  return person.shifts.find((s) => s.start <= minute && minute < s.end) ?? null;
}

type JobGroup = {
  job: CrewJob;
  // On the clock or on a break at this job now.
  here: { person: CrewPerson; status: CrewStatus }[];
  // A shift here today, or time worked here today, and not here now.
  scheduled: { person: CrewPerson; status: CrewStatus }[];
};

// Today's crew by job: every job somebody is at or has a shift on, in the answer's order
// (by name). A person on the clock elsewhere still shows under the job their shift is on,
// and one who worked somewhere with no shift shows there.
export function byJob(crew: Crew, minute: string): JobGroup[] {
  return crew.jobs
    .map((job) => {
      const here: JobGroup["here"] = [];
      const scheduled: JobGroup["scheduled"] = [];
      for (const person of crew.people) {
        const status = crewStatus(person, minute);
        if (person.clock.status !== "off" && person.clock.jobId === job.id) {
          here.push({ person, status });
        } else if (
          person.shifts.some((s) => s.jobId === job.id) ||
          person.workedJobIds.includes(job.id)
        ) {
          scheduled.push({ person, status });
        }
      }
      return { job, here, scheduled };
    })
    .filter((g) => g.here.length > 0 || g.scheduled.length > 0);
}

// Why a shift was not written: the server's own code, which names the tab's sentence.
// Anything else is `failed`.
const REFUSALS = [
  "schedule",
  "user_inactive",
  "job_archived",
  "same_job",
  "started",
] as const;
export type Refusal = (typeof REFUSALS)[number] | "failed";

type Answer =
  { result: string; code?: string; issues?: readonly { code: string }[] } | undefined;

export function refusalOf(answer: Answer): Refusal | null {
  if (answer === undefined) return "failed";
  if (answer.result !== "rejected") return null;
  return (REFUSALS as readonly string[]).includes(answer.code ?? "")
    ? (answer.code as Refusal)
    : "failed";
}

// Whether the app opens on Crew: an admin with no shift of their own on the company's
// today, and not on the clock. An admin who works a shift opens on their clock like anyone.
export function opensOnCrew(data: PullOutput, now: number): boolean {
  if (data.me.role !== "admin") return false;
  const today = wallClock(new Date(now), data.company.timezone).day;
  // A voided session still open is on the clock, as the server reads it (clock.ts, H1).
  const onTheClock = data.sessions.some((s) => s.state !== "ended");
  return !onTheClock && !data.shifts.some((s) => s.workDate === today);
}
