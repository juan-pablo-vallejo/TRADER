import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LocalEventType } from "./db/schema";
import { useLabor } from "./useLabor";
import type { PushFn } from "./db/sync";

const LABEL: Record<LocalEventType, string> = {
  started: "Clock in",
  paused: "Break",
  resumed: "Back to work",
  ended: "Clock out",
  voided: "Void",
};

const hhmm = (ms: number) => {
  const total = Math.floor(ms / 60000);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
};

/**
 * Phase 1's field surface: clock in, break, clock out — offline.
 *
 * Every button writes to SQLite and returns. Nothing here awaits the network, and
 * nothing is disabled because the network is absent.
 */
export function Clock({ jobId, push }: { jobId: string; push: PushFn }) {
  const { session, outbox, available, act, sync, syncing, lastSync } = useLabor(jobId);

  return (
    <View style={styles.wrap}>
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>
          {session
            ? session.events.at(-1)?.type === "paused"
              ? "On break"
              : "Working"
            : "Clocked out"}
        </Text>
        {session && (
          <Text style={styles.statusDetail}>
            {hhmm(session.workedMs)} logged · since{" "}
            {session.startedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        {available.map((type) => (
          <Pressable key={type} onPress={() => act(type)} style={styles.action}>
            <Text style={styles.actionText}>{LABEL[type]}</Text>
          </Pressable>
        ))}
      </View>

      {/*
        CONFLICT-6: sync state is shown as it is, never implying delivery.
        `rejected` is called out separately from `failed` because one will retry
        and the other never will — the worker has to act differently.
      */}
      <View style={styles.outbox}>
        <Text style={styles.outboxTitle}>Sync</Text>
        <Text style={styles.outboxLine}>
          {outbox.synced} sent · {outbox.pending + outbox.failed} waiting
          {outbox.rejected > 0 ? ` · ${outbox.rejected} need attention` : ""}
        </Text>
        {outbox.rejected > 0 && (
          <Text style={styles.warn}>
            {outbox.rejected} event{outbox.rejected === 1 ? "" : "s"} the server refused.
            These will not retry — tell the office.
          </Text>
        )}
        <Pressable
          onPress={() => void sync(push)}
          disabled={syncing}
          style={[styles.syncButton, syncing && styles.syncButtonBusy]}
        >
          <Text style={styles.syncText}>{syncing ? "Syncing…" : "Sync now"}</Text>
        </Pressable>
        {lastSync && <Text style={styles.meta}>{lastSync}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16, marginTop: 8 },
  statusCard: { paddingVertical: 12 },
  statusLabel: { fontSize: 24, fontWeight: "700" },
  statusDetail: { fontSize: 15, color: "#555", marginTop: 4 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  action: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  outbox: { gap: 6, borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingTop: 14 },
  outboxTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#888",
    letterSpacing: 0.5,
  },
  outboxLine: { fontSize: 15 },
  warn: { fontSize: 14, color: "#b00020" },
  syncButton: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  syncButtonBusy: { opacity: 0.5 },
  syncText: { fontSize: 15 },
  meta: { fontSize: 13, color: "#777" },
});
