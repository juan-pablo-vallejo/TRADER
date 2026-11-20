// The chip under a screen's title: where this phone's entries stand, in one of four words —
// Sent, Saved on phone, Sending, Needs attention — each with its own icon and tint, never a
// color alone. A tap opens what is waiting: why sending is held, if it is; each entry
// still on this phone with its reason in plain words; and Send now. Shown on every tab, so
// a failure is never silent.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { timeOfDay } from "../format";
import { useStrings } from "../i18n";
import type { Catalog } from "../i18n/catalog";
import { useSync } from "../sync/provider";
import { type ChipState, waiting } from "../sync/today";
import type { OutboxRecord } from "../sync/types";
import { color, size, space } from "../theme";
import { Button, text } from "./controls";
import { Sheet } from "./sheet";

// What an entry still on this phone needs said about it, or nothing when it simply counts.
function entryNote(record: OutboxRecord, t: Catalog["entry"]): string | null {
  if (record.standing === "rejected") {
    const known = t.refusals as unknown as Record<string, string | undefined>;
    const code = record.code ?? "";
    const why =
      code !== "other" && typeof known[code] === "string"
        ? known[code]
        : t.refusals.other(code);
    return `${t.refused} ${why}`;
  }
  // Sent and accepted: it counts, and goes from this list with the next pull.
  return record.standing === "settled" ? null : t.unsent;
}

// The chip's look per state. The test id keeps the three tones the flows already select
// by: `sync-synced`, `sync-pending`, `sync-attention`.
const LOOK: Record<
  ChipState,
  {
    tone: "synced" | "pending" | "attention";
    icon: keyof typeof Ionicons.glyphMap;
    ink: string;
    tint: string;
  }
> = {
  sent: {
    tone: "synced",
    icon: "checkmark-circle",
    ink: color.doneInk,
    tint: color.doneTint,
  },
  saved: {
    tone: "pending",
    icon: "phone-portrait-outline",
    ink: color.neutralInk,
    tint: color.neutralTint,
  },
  sending: {
    tone: "pending",
    icon: "arrow-up-circle-outline",
    ink: color.activeInk,
    tint: color.activeTint,
  },
  attention: {
    tone: "attention",
    icon: "alert-circle",
    ink: color.problemInk,
    tint: color.problemTint,
  },
};

export function SyncChip() {
  const { t, language } = useStrings();
  const { snapshot, records, last, syncing, refused, sync } = useSync();
  const [open, setOpen] = useState(false);
  const where = waiting({ records, last, syncing, refused });
  const look = LOOK[where.state];
  const zone = snapshot?.data.company.timezone ?? "UTC";
  const names = new Map<string, string>([
    ...(snapshot?.data.shifts ?? []).map((s) => [s.job.id, s.job.name] as const),
    ...(snapshot?.data.jobs ?? []).map((j) => [j.id, j.name] as const),
  ]);

  const held =
    where.held === "sign_in"
      ? t.sync.signInAgain
      : where.held === "paused"
        ? t.sync.paused
        : where.held === "update"
          ? t.sync.updateRequired
          : where.held === "read_only"
            ? t.sync.readOnly
            : where.held === "offline"
              ? t.sync.offline
              : null;

  // Each with a test id numbered within its own kind: `entry-unsent-0` is the oldest entry
  // not sent, however many refused ones are listed before it.
  const seen = { refused: 0, unsent: 0 };
  const noted = records.flatMap((record) => {
    const note = entryNote(record, t.entry);
    if (note === null) return [];
    const kind = record.standing === "rejected" ? "refused" : "unsent";
    const testID = `entry-${kind}-${seen[kind]}`;
    seen[kind] += 1;
    return [{ record, note, testID }];
  });

  return (
    <>
      <Pressable
        testID={`sync-${look.tone}`}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={[styles.chip, { backgroundColor: look.tint }]}
      >
        <Ionicons name={look.icon} size={18} color={look.ink} />
        <Text style={[text.secondary, styles.word, { color: look.ink }]}>
          {t.sync.chip[where.state]}
          {where.unsent > 0 ? ` · ${String(where.unsent)}` : ""}
        </Text>
      </Pressable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t.sync.waitingTitle}
        testID="sync-sheet"
      >
        {held !== null && (
          <Text testID="sync-held" style={text.body}>
            {held}
          </Text>
        )}
        {where.wrongClock && (
          <Text
            testID="sync-wrong-clock"
            accessibilityRole="alert"
            style={text.attention}
          >
            {t.sync.wrongClock}
          </Text>
        )}
        {noted.length === 0 ? (
          <Text testID="sync-nothing" style={text.body}>
            {where.unsent === 0 && held === null
              ? t.sync.upToDate
              : t.sync.nothingWaiting}
          </Text>
        ) : (
          <View style={styles.list}>
            {noted.map(({ record, note, testID }) => (
              <View key={record.id} testID={testID} style={styles.row}>
                <Text style={text.bodyStrong}>
                  {t.entry.types[record.payload.type]} ·{" "}
                  {timeOfDay(record.payload.clientTimestamp, zone, language)} ·{" "}
                  {names.get(record.payload.jobId) ?? "—"}
                </Text>
                <Text
                  style={record.standing === "rejected" ? text.attention : text.secondary}
                >
                  {note}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Button
          testID="sync-now"
          label={syncing ? t.sync.working : t.sync.now}
          disabled={syncing}
          onPress={() => void sync()}
        />
        <Button
          testID="sync-close"
          kind="secondary"
          label={t.sync.close}
          onPress={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: 32,
    paddingHorizontal: space[3],
    borderRadius: 16,
  },
  word: { fontWeight: "600" },
  list: { gap: space[2] },
  row: {
    gap: space[1],
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.canvas,
  },
});
