// What the office's repair editors send to `labor.repair` (ARCHITECTURE, 2026-11-05, office
// labor repairs), built from what `labor.ledger` showed and nothing else. Pure: no React, no
// request. A correction names its root — the entry with no `correctsEventId`, or the one a
// correction names — and the entry the office saw in effect for it, which the server holds
// it to (`repair_stale`); it keeps its entry's type, and only a start may move to another
// job. An added entry goes on the session's job as the set leaves it. Times are entered as
// the company's clock read them (zoned.ts); an entry whose time was not touched keeps its
// instant to the millisecond. Consumed by ledger-screen.tsx.
import type { AppRouter } from "@trader/api";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { uuidv7 } from "../closeout/uuidv7";
import { instantToWall, wallToInstant } from "../zoned";

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

export const voidOperation = (session: LedgerSession): Unminted => ({
  kind: "void",
  voidsEventId: session.rootEventId,
});

// Gives a set its ids (ARCHITECTURE invariant 2: UUIDv7 from the client that originates the
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
