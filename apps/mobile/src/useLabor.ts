import { openSession, type Session } from "@trader/api/sync";
import { useCallback, useMemo, useState } from "react";

import { migrateLocalDb } from "./db/client";
import { summarize, type OutboxSummary } from "./db/outbox-logic";
import type { LocalEventType } from "./db/schema";
import { allEvents, recordEvent, toFoldEvents, type LocalEventRow } from "./db/store";
import { flushOutbox, type PushFn } from "./db/sync";

/**
 * The clock-in surface, over the local store.
 *
 * The ordering here is the product's founding promise made concrete: a tap writes
 * to SQLite and the UI updates from local state. Nothing awaits the network, so
 * a foreman in a basement clocks in exactly as fast as one on a rooftop.
 */

let migrated = false;

export type LaborState = {
  events: LocalEventRow[];
  session: Session | null;
  outbox: OutboxSummary;
};

function read(): LaborState {
  const events = allEvents();
  return {
    events,
    // The same fold the server runs (DERIVE-6) — not a second implementation
    // that could drift from it.
    session: openSession(toFoldEvents(events)),
    outbox: summarize(events),
  };
}

export function useLabor(jobId: string) {
  if (!migrated) {
    migrateLocalDb();
    migrated = true;
  }

  const [state, setState] = useState<LaborState>(read);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const act = useCallback(
    (type: LocalEventType) => {
      recordEvent({ jobId, type });
      // Re-read rather than patch: the fold is the source of truth for what the
      // session now is, and reconstructing it from the events avoids keeping a
      // second, divergent notion of state in React.
      setState(read());
    },
    [jobId],
  );

  const sync = useCallback(async (push: PushFn) => {
    setSyncing(true);
    try {
      const outcome = await flushOutbox(push);
      setLastSync(
        outcome.attempted === 0
          ? "Nothing to sync"
          : `${outcome.synced} synced · ${outcome.rejected} rejected · ${outcome.retrying} retrying`,
      );
    } finally {
      // Always re-read: a partial flush still changed rows, and leaving the UI
      // showing pre-flush state would be the "implying delivery" CONFLICT-6
      // forbids, in reverse.
      setState(read());
      setSyncing(false);
    }
  }, []);

  /** SESSION-2's legal transitions, so the UI offers only what will be accepted. */
  const available = useMemo<LocalEventType[]>(() => {
    const last = state.session?.events.at(-1)?.type;
    if (!state.session) return ["started"];
    if (last === "paused") return ["resumed", "ended"];
    return ["paused", "ended"];
  }, [state.session]);

  return { ...state, available, act, sync, syncing, lastSync };
}
