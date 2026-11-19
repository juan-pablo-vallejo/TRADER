// The sync layer as the screens see it: the last pull's snapshot, this person's records
// still on the phone, the clock's state, and `tap`, which writes to the store and returns.
// Cycles run when someone signs in, when the app comes forward, every minute while it is in
// front, and after each capture; they coalesce (engine.ts). Nothing here is on the capture
// path but the store.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import * as Crypto from "expo-crypto";

import { createApi } from "../api";
import { apiUrl, BUILD } from "../config";
import { createMinter } from "../ids";
import { locationStamp, refreshLocation } from "../location";
import { headersFor, useSession } from "../session";
import { deviceStore } from "../store/device";
import { clockState, recordsFor, type ClockState, type Tap } from "./clock";
import {
  createSyncer,
  READING_KEY,
  readSnapshot,
  runCycle,
  type CycleResult,
} from "./engine";
import type { OutboxRecord, Snapshot, Transport } from "./types";

// While the app is in front. The reachability reading is fresh for two of these (clock.ts).
export const CYCLE_MS = 60_000;

const mint = createMinter((count) => Crypto.getRandomBytes(count));

type Value = {
  snapshot: Snapshot | null;
  records: OutboxRecord[];
  clock: ClockState;
  // The last cycle's outcome; null before the first one ends.
  last: CycleResult | null;
  syncing: boolean;
  // The server would not take this session: sign in again; the records are kept.
  refused: boolean;
  tap: (tap: Tap) => Promise<boolean>;
  sync: () => Promise<void>;
};
const SyncContext = createContext<Value | null>(null);

const unauthorized = (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  const [last, setLast] = useState<CycleResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refused, setRefused] = useState(false);
  const signedIn = session !== null && session !== undefined;

  const refresh = useCallback(async () => {
    const kept = await readSnapshot(deviceStore);
    setSnapshot(kept);
    setRecords(kept === null ? [] : await deviceStore.records(kept.data.me.id));
    return kept;
  }, []);

  const request = useMemo(() => {
    if (!signedIn || apiUrl === null) return null;
    const api = createApi(apiUrl, () => headersFor(session));
    const seen = async <T,>(call: Promise<T>): Promise<T> => {
      try {
        const answer = await call;
        setRefused(false);
        return answer;
      } catch (error) {
        if (unauthorized(error)) setRefused(true);
        throw error;
      }
    };
    const transport: Transport = {
      status: async () =>
        (
          await api.status.get.query({
            protocolVersion: 1,
            platform: Platform.OS === "ios" ? "ios" : "android",
            build: BUILD,
          })
        ).state,
      push: async ({ deviceNow, records: sent }) => {
        const answer = await seen(
          api.sync.push.mutate({ protocolVersion: 1, deviceNow, records: sent }),
        );
        return {
          clockSkewMs: answer.clockSkewMs,
          results: answer.results.map((r) =>
            r.result === "rejected"
              ? { id: r.id, result: r.result, code: r.code }
              : {
                  id: r.id,
                  result: r.result,
                  flags: r.kind === "labor_event" ? r.ack.flags : [],
                },
          ),
        };
      },
      pull: () => seen(api.sync.pull.query({ protocolVersion: 1 })),
    };
    return createSyncer(async () => {
      setSyncing(true);
      try {
        void refreshLocation();
        const result = await runCycle(deviceStore, transport, Date.now);
        await refresh();
        setLast(result);
      } finally {
        setSyncing(false);
      }
    });
  }, [signedIn, session, refresh]);

  // What is on the phone is shown before any network answer.
  useEffect(() => {
    if (!signedIn) {
      setSnapshot(null);
      setRecords([]);
      setLast(null);
      setRefused(false);
      return;
    }
    void refresh();
  }, [signedIn, refresh]);

  useEffect(() => {
    if (request === null) return;
    void request();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void request();
    }, CYCLE_MS);
    const forward = AppState.addEventListener("change", (state) => {
      if (state === "active") void request();
    });
    return () => {
      clearInterval(timer);
      forward.remove();
    };
  }, [request]);

  const state = useMemo(
    () => clockState(snapshot?.data ?? null, records),
    [snapshot, records],
  );
  const tap = useCallback(
    async (what: Tap) => {
      // Read from the store, not from what is drawn: two quick taps are two captures, and
      // a tap that lands while a cycle is replacing the snapshot and pruning the records
      // it now shows must see both as the store has them, never one of each.
      // The records first, the snapshot after: a cycle writes its snapshot before it prunes
      // (engine.ts), so records read first are never fewer than that snapshot accounts for.
      const me = (await readSnapshot(deviceStore))?.data.me.id;
      if (me === undefined) return false;
      const now = Date.now();
      const mine = await deviceStore.records(me);
      const kept = await readSnapshot(deviceStore);
      if (kept === null || kept.data.me.id !== me) return false;
      const reading = await deviceStore.read(READING_KEY);
      const written = recordsFor(what, clockState(kept.data, mine), {
        me,
        now,
        reading: reading === null ? null : Number(reading),
        location: locationStamp(now),
        mint,
      });
      if (written.length === 0) return false;
      await deviceStore.append(written);
      setRecords(await deviceStore.records(me));
      if (request !== null) void request();
      return true;
    },
    [request],
  );

  const sync = useCallback(async () => {
    if (request !== null) await request();
  }, [request]);

  const value = useMemo(
    () => ({ snapshot, records, clock: state, last, syncing, refused, tap, sync }),
    [snapshot, records, state, last, syncing, refused, tap, sync],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): Value {
  const value = useContext(SyncContext);
  if (value === null) throw new Error("useSync needs SyncProvider above it");
  return value;
}
