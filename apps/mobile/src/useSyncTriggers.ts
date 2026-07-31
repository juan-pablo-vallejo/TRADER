import * as Network from "expo-network";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { createScheduler, type SyncReason } from "./db/scheduler";

/**
 * CONFLICT-6's triggers: **on reconnect, on app foreground, and on a timer.**
 *
 * All three go through one scheduler, because they routinely fire together —
 * walking out of a basement regains signal *and* foregrounds the app within the
 * same second. Without coalescing that is three cycles pushing the same rows.
 */

/**
 * How often the timer fires.
 *
 * Not the same thing as how often sync happens: the scheduler throttles automatic
 * cycles, so this is the ceiling on staleness rather than a promise of work. Two
 * minutes is a compromise between an office that wants to see the crew's day
 * appear and a battery that has to last a ten-hour shift.
 */
export const SYNC_TIMER_MS = 2 * 60 * 1000;

export function useSyncTriggers(
  run: (reason: SyncReason) => Promise<void>,
  enabled = true,
) {
  // The scheduler must outlive re-renders or its in-flight lock resets every
  // time React re-runs this component, which is exactly when triggers overlap.
  const runRef = useRef(run);
  runRef.current = run;

  const scheduler = useMemo(
    () => createScheduler((reason) => runRef.current(reason)),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const request = (reason: SyncReason) => {
      if (cancelled) return;
      // Fire and forget: a trigger firing must never surface as an unhandled
      // rejection, and the outbox has already recorded the per-record outcome.
      void scheduler.request(reason).catch(() => undefined);
    };

    // 1. Foreground. `active` also fires on first mount, which is wanted — an app
    //    opened after a night offline should catch up without waiting for a timer.
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") request("foreground");
    });

    // 2. Reconnect. The listener reports every change, so filter to the
    //    transition into reachability; a drop is not worth a sync attempt.
    let wasConnected: boolean | null = null;
    const network = Network.addNetworkStateListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (connected && wasConnected === false) request("reconnect");
      wasConnected = connected;
    });

    // 3. Timer.
    const timer = setInterval(() => request("timer"), SYNC_TIMER_MS);

    request("foreground");

    return () => {
      cancelled = true;
      appState.remove();
      network.remove();
      clearInterval(timer);
    };
  }, [scheduler, enabled]);

  return scheduler;
}
