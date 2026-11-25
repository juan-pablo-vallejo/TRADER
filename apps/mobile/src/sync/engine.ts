// One sync cycle, and the rule that two never run at once.
// A cycle asks the service's state first; then, oldest first, it
// pushes this person's pending records and reads each answer — `accepted` and `duplicate`
// settle a record, `rejected` condemns it for good, and a record the answer leaves out goes
// back to pending under the same id; then it pulls. A call that throws is the network, never
// a verdict: nothing is marked rejected or lost, and the next cycle tries again. Under
// `paused` or `update_required` the outbox is not touched at all; under `read_only` it is
// kept and only the pull runs.
import {
  CALL_DEADLINE_MS,
  MAX_PUSH_RECORDS,
  type ServiceState,
} from "@trader/api/contract";
import superjson from "superjson";

import type { PushAnswer, Snapshot, Store, Transport } from "./types";

// A call that has not answered by the contract's deadline is given up, as one the network
// failed is: one that never answered held this cycle, and every cycle queued behind it.
export { CALL_DEADLINE_MS };

const within = <T>(call: () => Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    call().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

// A record stuck `syncing` is reclaimed after two minutes.
export const RECLAIM_MS = 2 * 60_000;
// The server takes at most this many records in a push (its MAX_RECORDS).
const BATCH = MAX_PUSH_RECORDS;

export const SNAPSHOT_KEY = "snapshot";
// The pull's shape as this build reads it. Raise it in the commit that changes what a pull
// answers (packages/api, contract/pull.ts), and add the step from the shape before to
// UPCAST: a snapshot an older build stored is read as this build's (H3: thrown away, it
// left a phone that updated overnight with nothing to clock in to until its first pull).
// A shape this build does not know, newer or unreadable, is thrown away and pulled again.
// 2: the company's phone, `locationStamps`, each job's notes (2026-11-19).
export const SNAPSHOT_SHAPE = 2;

type Loose = Record<string, unknown>;
const withNotes = (job: unknown) => ({ notes: null, ...(job as Loose) });

// Each step takes a snapshot's data from the shape before it to its own. A build before
// shape 2 stored none (`undefined`, read as 1).
const UPCAST: Record<number, (data: Loose) => Loose> = {
  2: (data) => ({
    locationStamps: true,
    ...data,
    company: { phone: null, ...(data.company as Loose) },
    jobs: ((data.jobs as unknown[] | undefined) ?? []).map(withNotes),
    shifts: ((data.shifts as Loose[] | undefined) ?? []).map((s) => ({
      ...s,
      job: withNotes(s.job),
    })),
  }),
};
export const READING_KEY = "reachability";

export type CycleResult =
  | { outcome: "unreachable" }
  | { outcome: "held"; state: Extract<ServiceState, "paused" | "update_required"> }
  | {
      outcome: "synced";
      state: Extract<ServiceState, "normal" | "read_only">;
      settled: number;
      rejected: number;
      // Whether every pending record was answered; false when a push failed part-way.
      drained: boolean;
      pulled: boolean;
      // The server's reading of this phone's clock, when a push returned one.
      clockSkewMs: number | null;
    };

// The server's push results as the cycle reads them. A result this build does not know
// (a newer server's) carries no acknowledgement this build can read: passed through as it
// is, so the cycle leaves its record pending, and never read as one that was accepted.
type ServerResult = {
  id: string;
  kind: string | null;
  result: string;
  code?: string;
  ack?: { flags?: string[] };
};
export const answersOf = (results: readonly ServerResult[]): PushAnswer[] =>
  results.map((r) =>
    r.result === "rejected"
      ? { id: r.id, result: "rejected", code: r.code ?? "" }
      : r.result === "accepted" || r.result === "duplicate"
        ? { id: r.id, result: r.result, flags: r.ack?.flags ?? [] }
        : ({ id: r.id, result: r.result } as unknown as PushAnswer),
  );

export async function readSnapshot(store: Store): Promise<Snapshot | null> {
  const raw = await store.read(SNAPSHOT_KEY);
  if (raw === null) return null;
  let kept: Partial<Snapshot> | null = null;
  try {
    kept = superjson.parse<Partial<Snapshot> | null>(raw);
  } catch {
    // Not a snapshot at all: gone, like one of a shape this build does not know.
  }
  const shape = kept?.shape ?? 1;
  if (
    kept === null ||
    typeof kept !== "object" ||
    !Number.isInteger(shape) ||
    shape < 1 ||
    shape > SNAPSHOT_SHAPE ||
    typeof kept.pulledAt !== "number" ||
    typeof kept.data !== "object" ||
    kept.data === null
  ) {
    // Unreadable, or a newer build's. The outbox is another table and is not touched:
    // nothing captured is lost, and the next cycle pulls afresh.
    await store.write(SNAPSHOT_KEY, null);
    return null;
  }
  let data = kept.data as unknown as Loose;
  try {
    for (let step = shape + 1; step <= SNAPSHOT_SHAPE; step += 1)
      data = UPCAST[step]!(data);
  } catch {
    // Stored data no step can read: dropped and pulled again, like an unreadable snapshot.
    await store.write(SNAPSHOT_KEY, null);
    return null;
  }
  return {
    shape: SNAPSHOT_SHAPE,
    pulledAt: kept.pulledAt,
    data: data as Snapshot["data"],
  };
}

export async function runCycle(
  store: Store,
  transport: Transport,
  now: () => number,
  // Told of every call that threw, for the error report (sync/failures.ts). What a cycle
  // does about a thrown call does not depend on it.
  failed: (stage: "status" | "push" | "pull", error: unknown) => void = () => undefined,
  deadlineMs: number = CALL_DEADLINE_MS,
): Promise<CycleResult> {
  await store.reclaim(now() - RECLAIM_MS);
  // The last time the API answered at all: what a capture reads to say it was online.
  const reached = () => store.write(READING_KEY, String(now()));

  const pull = async (): Promise<string | null> => {
    try {
      const data = await within(() => transport.pull(), deadlineMs);
      const snapshot: Snapshot = { shape: SNAPSHOT_SHAPE, pulledAt: now(), data };
      await store.write(SNAPSHOT_KEY, superjson.stringify(snapshot));
      await reached();
      // Every settled record goes once a pull has succeeded (H2): the server has it, and the
      // pull read what was committed after it settled, so the snapshot shows it with its
      // flags, or it is older than the pull's window and no longer the clock's business.
      // Kept, one beyond the window was replayed into the clock for good. Cycles never
      // overlap (createSyncer), so no push is settling one while this runs.
      await store.prune(data.me.id);
      return data.me.id;
    } catch (error) {
      failed("pull", error);
      return null;
    }
  };
  let state: ServiceState;
  try {
    state = await within(() => transport.status(), deadlineMs);
  } catch (error) {
    failed("status", error);
    return { outcome: "unreachable" };
  }
  await reached();
  if (state === "paused" || state === "update_required") {
    // Held, the outbox is not touched. A phone with no snapshot still pulls once, so it has
    // its jobs to clock in to: no state stops a capture (packages/api core/status.ts, H3).
    if ((await readSnapshot(store)) === null) await pull();
    return { outcome: "held", state };
  }

  let settled = 0;
  let rejected = 0;
  let drained = true;
  let clockSkewMs: number | null = null;
  // Whose records to send is what the last pull said, never what a record claims. With no
  // snapshot — the first cycle after a sign-in — a pull comes first to learn it.
  const owner = (await readSnapshot(store))?.data.me.id ?? (await pull());
  while (state === "normal" && owner !== null) {
    const batch = await store.due(owner, BATCH);
    if (batch.length === 0) break;
    const ids = batch.map((r) => r.id);
    await store.claim(ids, now());
    let answer: Awaited<ReturnType<Transport["push"]>>;
    try {
      answer = await within(
        () =>
          transport.push({
            deviceNow: new Date(now()),
            records: batch.map((r) => ({
              id: r.id,
              kind: r.kind,
              schemaVersion: r.schemaVersion,
              payload: r.payload,
            })),
          }),
        deadlineMs,
      );
    } catch (error) {
      failed("push", error);
      // The server may have written them; the resend answers `duplicate`.
      await store.release(ids);
      drained = false;
      break;
    }
    await reached();
    clockSkewMs = answer.clockSkewMs;
    const answered = new Set<string>();
    const unknown = new Set<string>();
    for (const result of answer.results) {
      // An answer for a record this push did not send is not ours to act on.
      if (!ids.includes(result.id) || answered.has(result.id)) continue;
      answered.add(result.id);
      if (result.result === "rejected") {
        await store.reject(result.id, result.code);
        rejected += 1;
      } else if (result.result === "accepted" || result.result === "duplicate") {
        await store.settle(result.id, result.flags);
        settled += 1;
      } else {
        // An answer a newer server gives that this build does not know: left pending, as
        // if unanswered, and sent again under the same id.
        unknown.add(result.id);
      }
    }
    const omitted = ids.filter((id) => !answered.has(id) || unknown.has(id));
    if (omitted.length > 0) await store.release(omitted);
    // The server stopped before the end of the batch: the rest waits for the next cycle,
    // so one that never answers cannot spin this one.
    if (omitted.length > 0) {
      drained = false;
      break;
    }
  }
  if (state !== "normal" && owner !== null) {
    drained = (await store.due(owner, 1)).length === 0;
  }

  const pulled = (await pull()) !== null;
  return { outcome: "synced", state, settled, rejected, drained, pulled, clockSkewMs };
}

// Triggers — a capture, the app coming forward, the timer — coalesce: while a cycle runs,
// any number of requests add up to one more cycle after it, and every caller is answered
// by a cycle that began after it asked.
export function createSyncer<T>(run: () => Promise<T>) {
  let running: Promise<T> | null = null;
  let queued: Promise<T> | null = null;
  const start = (): Promise<T> => {
    const p = run().finally(() => {
      if (running === p) running = null;
    });
    running = p;
    return p;
  };
  return function request(): Promise<T> {
    if (running === null) return start();
    if (queued === null) {
      const after = running.then(
        () => undefined,
        () => undefined,
      );
      const next: Promise<T> = after.then(() => {
        queued = null;
        return start();
      });
      queued = next;
    }
    return queued;
  };
}
