// What the office's repair editors send to `labor.repair`,
// built from what `labor.ledger` showed and nothing else. Pure: no React, no
// request. A correction names its root — the entry with no `correctsEventId`, or the one a
// correction names — and the entry the office saw in effect for it, which the server holds
// it to (`repair_stale`); it keeps its entry's type, and only a start may move to another
// job. An added entry goes on the session's job as the set leaves it. Times are entered as
// the company's clock read them (zoned.ts); an entry whose time was not touched keeps its
// instant to the millisecond. Consumed by day-panel.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { uuidv7 } from "../../uuidv7";
import { instantToWall, wallToInstant } from "../../zoned";

export type RepairInput = inferRouterInputs<AppRouter>["labor"]["repair"];
export type Operation = RepairInput["operations"][number];
export type LedgerSession =
  inferRouterOutputs<AppRouter>["labor"]["ledger"]["sessions"][number];
export type LedgerEvent = LedgerSession["events"][number];

// An operation before it has an id.
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type Unminted = WithoutId<Operation>;

// The most one call takes (labor/repair.ts).
export const MAX_OPERATIONS = 20;

type Positional = "started" | "paused" | "resumed" | "ended";
export type AddedType = Exclude<Positional, "started">;

// A session's editor: the wall time of each entry in effect by its id, the start's job, and
// the entries being added.
export type SessionDraft = {
  jobId: string;
  times: Record<string, string>;
  added: { type: AddedType; at: string }[];
};

export type Built =
  | { ok: true; operations: Unminted[] }
  // `field` is the entry's id, or `added-N`, `start`, `end`: the control the time is in.
  | { ok: false; problem: "bad_time"; field: string }
  | { ok: false; problem: "too_many" };

type InEffect = LedgerEvent & { type: Positional };

// The entries a session is read from now, in the ledger's order: what a correction replaces.
export const inEffect = (session: LedgerSession): InEffect[] =>
  session.events.filter(
    (e): e is InEffect => e.effect === "in_effect" && e.type !== "voided",
  );

export const draftOf = (session: LedgerSession, timeZone: string): SessionDraft => ({
  jobId: session.job.id,
  times: Object.fromEntries(
    inEffect(session).map((e) => [e.id, instantToWall(e.clientTimestamp, timeZone)]),
  ),
  added: [],
});

// One set for everything the editor changed: a correction per entry whose time, or whose
// job on a start, differs from what was shown, then the added entries. Nothing changed is
// an empty set, which the screen answers itself.
export function sessionOperations(
  session: LedgerSession,
  draft: SessionDraft,
  timeZone: string,
): Built {
  const operations: Unminted[] = [];
  for (const e of inEffect(session)) {
    const wall = draft.times[e.id] ?? "";
    const timeChanged = wall !== instantToWall(e.clientTimestamp, timeZone);
    const jobChanged = e.type === "started" && draft.jobId !== e.job.id;
    if (!timeChanged && !jobChanged) continue;
    const at = timeChanged ? wallToInstant(wall, timeZone) : e.clientTimestamp;
    if (at === null) return { ok: false, problem: "bad_time", field: e.id };
    operations.push({
      kind: "correct",
      correctsEventId: e.correctsEventId ?? e.id,
      replacesEventId: e.id,
      type: e.type,
      jobId: e.type === "started" ? draft.jobId : e.job.id,
      clientTimestamp: at,
    });
  }
  for (const [i, added] of draft.added.entries()) {
    const at = wallToInstant(added.at, timeZone);
    if (at === null) return { ok: false, problem: "bad_time", field: `added-${i}` };
    operations.push({
      kind: "append",
      type: added.type,
      jobId: draft.jobId,
      clientTimestamp: at,
    });
  }
  if (operations.length > MAX_OPERATIONS) return { ok: false, problem: "too_many" };
  return { ok: true, operations };
}

// Hours nobody recorded: a clock in and, when the office knows it, the clock out, as one set.
export function missingHours(
  draft: { jobId: string; start: string; end: string },
  timeZone: string,
): Built {
  const start = wallToInstant(draft.start, timeZone);
  if (start === null) return { ok: false, problem: "bad_time", field: "start" };
  const operations: Unminted[] = [
    { kind: "append", type: "started", jobId: draft.jobId, clientTimestamp: start },
  ];
  if (draft.end !== "") {
    const end = wallToInstant(draft.end, timeZone);
    if (end === null) return { ok: false, problem: "bad_time", field: "end" };
    operations.push({
      kind: "append",
      type: "ended",
      jobId: draft.jobId,
      clientTimestamp: end,
    });
  }
  return { ok: true, operations };
}

// The time worked a draft would give, breaks left out, as the times are typed: a preview
// beside the editor and never a figure of record (the server folds the ledger and rounds;
// labor/fold.ts, labor/hours.ts). The entries in effect at their typed times and the added
// ones, in time order, walked as the fold walks them: working from a clock in or a break
// end, stopped by a break start or the clock out. Null while a time is missing or
// impossible, or the order is not one a session can have: nothing is guessed. `open` says
// the last entry leaves the session on the clock, so the figure is of closed time only.
export type Preview = { workedMs: number; open: boolean } | null;

type Mark = { type: Positional; at: Date | null };

export function previewOf(marks: readonly Mark[]): Preview {
  if (marks.length === 0 || marks.some((m) => m.at === null)) return null;
  // Stable by time: two entries at one minute keep the order they were listed in.
  const ordered = marks
    .map((m, index) => ({ type: m.type, at: (m.at as Date).getTime(), index }))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  let state: "idle" | "working" | "paused" | "ended" = "idle";
  let since = 0;
  let workedMs = 0;
  for (const m of ordered) {
    if (m.type === "started" && state === "idle") state = "working";
    else if (m.type === "paused" && state === "working") {
      workedMs += m.at - since;
      state = "paused";
    } else if (m.type === "resumed" && state === "paused") state = "working";
    else if (m.type === "ended" && (state === "working" || state === "paused")) {
      if (state === "working") workedMs += m.at - since;
      state = "ended";
    } else return null;
    since = m.at;
  }
  return { workedMs, open: state !== "ended" };
}

export const sessionPreview = (
  session: LedgerSession,
  draft: SessionDraft,
  timeZone: string,
): Preview =>
  previewOf([
    ...inEffect(session).map((e) => ({
      type: e.type,
      at: wallToInstant(draft.times[e.id] ?? "", timeZone),
    })),
    ...draft.added.map((a) => ({ type: a.type, at: wallToInstant(a.at, timeZone) })),
  ]);

export const missingPreview = (
  draft: { start: string; end: string },
  timeZone: string,
): Preview =>
  previewOf([
    { type: "started", at: wallToInstant(draft.start, timeZone) },
    ...(draft.end === ""
      ? []
      : [{ type: "ended" as const, at: wallToInstant(draft.end, timeZone) }]),
  ]);

export const voidOperation = (session: LedgerSession): Unminted => ({
  kind: "void",
  voidsEventId: session.rootEventId,
});

// Gives a set its ids (UUIDv7, from the client that originates the
// record), one millisecond apart in the set's order: two entries at the same time are placed
// by id, so the ids must sort as the office listed them. The same set for the same person
// gets the same ids again, so a send that was never answered is sent again as itself and
// the server answers `duplicate`; anything changed is a new set under new ids.
export function createMinter(
  mint: (ms: number) => string = uuidv7,
  now: () => number = Date.now,
) {
  let last: { key: string; input: RepairInput } | null = null;
  return (workerId: string, operations: Unminted[]): RepairInput => {
    const key = JSON.stringify([workerId, operations]);
    if (last?.key === key) return last.input;
    const at = now();
    const input: RepairInput = {
      workerId,
      operations: operations.map((op, i) => ({ ...op, id: mint(at + i) }) as Operation),
    };
    last = { key, input };
    return input;
  };
}
