import { openSession, PULL_BATCH_SIZE, type Session } from "@trader/api/sync";
import { useCallback, useMemo, useState } from "react";

import { attest } from "./attest";
import { requiresAttestation } from "./attest-logic";
import { migrateLocalDb } from "./db/client";
import { summarize, type OutboxSummary } from "./db/outbox-logic";
import { pullEvents, type PullFn } from "./db/pull";
import { livePullDeps } from "./db/pull-store";
import type { LocalEventType } from "./db/schema";
import { allEvents, recordEvent, toFoldEvents, type LocalEventRow } from "./db/store";
import { flushOutbox, type PushFn } from "./db/sync";

/**
 * The clock-in surface, over the local store.
 *
 * The ordering here is the product's founding promise made concrete: a tap writes
 * to SQLite and the UI updates from local state. Nothing awaits the network, so
 * a foreman in a basement clocks in exactly as fast as one on a rooftop
 * (CAPTURE-1).
 */

let migrated = false;

export type LaborState = {
  events: LocalEventRow[];
  session: Session | null;
  outbox: OutboxSummary;
};

function read(workerId: string): LaborState {
  const events = allEvents();
  return {
    events,
    // The same fold the server runs (DERIVE-6) — not a second implementation
    // that could drift. Scoped to this worker, because a foreman's device may
    // hold crew events and SESSION-1 is per worker.
    session: openSession(toFoldEvents(events, workerId)),
    outbox: summarize(events),
  };
}

export function useLabor(workerId: string, jobId: string) {
  if (!migrated) {
    migrateLocalDb();
    migrated = true;
  }

  const [state, setState] = useState<LaborState>(() => read(workerId));
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const act = useCallback(
    async (type: LocalEventType) => {
      /**
       * **The timestamp is the tap, not the prompt.**
       *
       * Face ID takes a moment, and a worker in gloves may take several. Stamping
       * after the prompt would push every clock-in later by however long the
       * device took to recognise its owner — a payroll error caused by the
       * evidence-gathering rather than the work.
       */
      const clientTimestamp = new Date();

      // ATTEST-1: every labor event is payroll, so every one is attested.
      // ATTEST-4: whatever comes back, including `none`, the event is written.
      const attestationLevel = requiresAttestation(type) ? await attest(type) : "none";

      recordEvent({ workerId, jobId, type, clientTimestamp, attestationLevel });
      // Re-read rather than patch: the fold is the source of truth for what the
      // session now is, and reconstructing it avoids keeping a second, divergent
      // notion of state in React.
      setState(read(workerId));
    },
    [workerId, jobId],
  );

  /**
   * One sync cycle: **push, then pull.**
   *
   * That order matters. Pushing first means this device's own events are on the
   * server before it asks what the server has, so the pull confirms them in the
   * same cycle rather than a later one — and a worker watching the screen sees
   * "waiting" become "sent" once, not twice.
   */
  const sync = useCallback(
    async (push: PushFn, pull: PullFn) => {
      setSyncing(true);
      try {
        const pushed = await flushOutbox(push);
        const pulled = await pullEvents(pull, PULL_BATCH_SIZE, livePullDeps);
        setLastSync(
          `${pushed.synced} sent · ${pulled.received} received` +
            (pushed.rejected ? ` · ${pushed.rejected} refused` : "") +
            (pushed.retrying ? ` · ${pushed.retrying} retrying` : ""),
        );
      } catch (error) {
        // A failed cycle is not a failed capture. The outbox already recorded the
        // per-record outcome; this only reports it.
        setLastSync(error instanceof Error ? error.message : "Sync failed");
      } finally {
        // Always re-read: a partial cycle still changed rows, and showing
        // pre-sync state would be the "implying delivery" CONFLICT-6 forbids,
        // in reverse.
        setState(read(workerId));
        setSyncing(false);
      }
    },
    [workerId],
  );

  /** SESSION-2's legal transitions, so the UI offers only what will be accepted. */
  const available = useMemo<LocalEventType[]>(() => {
    const last = state.session?.events.at(-1)?.type;
    if (!state.session) return ["started"];
    if (last === "paused") return ["resumed", "ended"];
    return ["paused", "ended"];
  }, [state.session]);

  return { ...state, available, act, sync, syncing, lastSync };
}
