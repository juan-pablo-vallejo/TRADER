// One sync cycle, and the rule that two never run at once (ARCHITECTURE, Sync protocol;
// Operational sync states). A cycle asks the service's state first; then, oldest first, it
// pushes this person's pending records and reads each answer — `accepted` and `duplicate`
// settle a record, `rejected` condemns it for good, and a record the answer leaves out goes
// back to pending under the same id; then it pulls. A call that throws is the network, never
// a verdict: nothing is marked rejected or lost, and the next cycle tries again. Under
// `paused` or `update_required` the outbox is not touched at all; under `read_only` it is
// kept and only the pull runs. Consumed by sync/provider.tsx.
import type { ServiceState } from "@trader/api/contract";
import superjson from "superjson";

import type { Snapshot, Store, Transport } from "./types";

// ARCHITECTURE, Sync protocol: a record stuck `syncing` is reclaimed after two minutes.
export const RECLAIM_MS = 2 * 60_000;
// The server takes at most this many records in a push (its MAX_RECORDS).
export const BATCH = 100;

export const SNAPSHOT_KEY = "snapshot";
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

export async function readSnapshot(store: Store): Promise<Snapshot | null> {
  const raw = await store.read(SNAPSHOT_KEY);
  return raw === null ? null : superjson.parse<Snapshot>(raw);
}

export async function runCycle(
  store: Store,
  transport: Transport,
  now: () => number,
): Promise<CycleResult> {
  await store.reclaim(now() - RECLAIM_MS);
  // The last time the API answered at all: what a capture reads to say it was online.
  const reached = () => store.write(READING_KEY, String(now()));

  let state: ServiceState;
  try {
    state = await transport.status();
  } catch {
    return { outcome: "unreachable" };
  }
  await reached();
  if (state === "paused" || state === "update_required") {
    return { outcome: "held", state };
  }

  let settled = 0;
  let rejected = 0;
  let drained = true;
  let clockSkewMs: number | null = null;
  const pull = async (): Promise<string | null> => {
    try {
      const data = await transport.pull();
      const snapshot: Snapshot = { pulledAt: now(), data };
      await store.write(SNAPSHOT_KEY, superjson.stringify(snapshot));
      await reached();
      // A settled record goes once the snapshot shows it: the entry counts, and its flags
      // are the snapshot's from here on.
      await store.prune(
        data.me.id,
        data.events.map((e) => e.id),
      );
      return data.me.id;
    } catch {
      return null;
    }
  };
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
      answer = await transport.push({
        deviceNow: new Date(now()),
        records: batch.map((r) => ({
          id: r.id,
          kind: r.kind,
          schemaVersion: r.schemaVersion,
          payload: r.payload,
        })),
      });
    } catch {
      // The server may have written them; the resend answers `duplicate`.
      await store.release(ids);
      drained = false;
      break;
    }
    await reached();
    clockSkewMs = answer.clockSkewMs;
    const answered = new Set<string>();
    for (const result of answer.results) {
      // An answer for a record this push did not send is not ours to act on.
      if (!ids.includes(result.id) || answered.has(result.id)) continue;
      answered.add(result.id);
      if (result.result === "rejected") {
        await store.reject(result.id, result.code);
        rejected += 1;
      } else {
        await store.settle(result.id, result.reasons);
        settled += 1;
      }
    }
    const omitted = ids.filter((id) => !answered.has(id));
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
