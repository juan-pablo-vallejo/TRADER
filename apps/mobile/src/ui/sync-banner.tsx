// The sync banner : one line saying where this phone's entries
// stand — sent, waiting, or held and why — and never a silent failure. Shown on every tab.
import { StyleSheet, Text, View } from "react-native";

import { useStrings } from "../i18n";
import { useSync } from "../sync/provider";
import { color, size, space } from "../theme";
import { text } from "./controls";

// The server tolerates five minutes of skew before it flags an entry.
const SKEW_MS = 5 * 60_000;

export function SyncBanner() {
  const { t } = useStrings();
  const { records, last, syncing, refused } = useSync();
  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;

  let tone: "synced" | "pending" | "attention" = unsent === 0 ? "synced" : "pending";
  let line = unsent === 0 ? t.sync.upToDate : t.sync.unsent(unsent);
  if (refused) {
    tone = "attention";
    line = t.sync.signInAgain;
  } else if (last?.outcome === "held") {
    tone = "attention";
    line = last.state === "paused" ? t.sync.paused : t.sync.updateRequired;
  } else if (last?.outcome === "unreachable") {
    tone = "pending";
    line = unsent === 0 ? t.sync.offline : `${t.sync.unsent(unsent)} ${t.sync.offline}`;
  } else if (last?.outcome === "synced" && last.state === "read_only" && unsent > 0) {
    tone = "pending";
    line = t.sync.readOnly;
  } else if (syncing && unsent > 0) {
    line = t.sync.working;
  }
  const skewed =
    last?.outcome === "synced" &&
    last.clockSkewMs !== null &&
    Math.abs(last.clockSkewMs) > SKEW_MS;

  return (
    <View style={styles.banner}>
      <Text
        testID={`sync-${tone}`}
        accessibilityLiveRegion="polite"
        style={[text.secondary, { color: color[tone] }]}
      >
        {line}
      </Text>
      {skewed && (
        <Text testID="sync-wrong-clock" accessibilityRole="alert" style={text.attention}>
          {t.sync.wrongClock}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: space[1],
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
});
