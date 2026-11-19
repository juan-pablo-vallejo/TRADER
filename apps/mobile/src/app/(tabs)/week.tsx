// The worker's own schedule and hours. Read-only, from the
// last pull, and it says how old that pull is: a schedule the office changed while this
// phone was offline is not known here until the next one, so an old one says it may be out
// of date. The shifts are the caller's own for this week and the next; the hours are the
// last two weeks' sessions as the server folds them.
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { age, dayName, duration, wallTime } from "../../format";
import { useStrings } from "../../i18n";
import { wallClock } from "../../sync/clock";
import { useSync } from "../../sync/provider";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { SyncBanner } from "../../ui/sync-banner";

// Older than this, the schedule on the phone is said to be possibly out of date.
export const STALE_MS = 60 * 60_000;

export default function Week() {
  const { t, language } = useStrings();
  const { snapshot, sync, syncing } = useSync();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const data = snapshot?.data ?? null;
  const old = snapshot === null ? null : now - snapshot.pulledAt;
  const today =
    data === null ? null : wallClock(new Date(now), data.company.timezone).day;
  const days = [...new Set((data?.shifts ?? []).map((s) => s.workDate))].filter(
    (day) => today === null || day >= today,
  );
  const jobName = new Map<string, string>([
    ...(data?.shifts ?? []).map((s) => [s.job.id, s.job.name] as const),
    ...(data?.jobs ?? []).map((j) => [j.id, j.name] as const),
  ]);
  // Clock-ins the schedule did not allow when they arrived: they count, and the office sees
  // the flag.
  const unscheduled = new Set(
    (data?.events ?? []).filter((e) => e.flags.includes("unscheduled")).map((e) => e.id),
  );
  const sessions = [...(data?.sessions ?? [])]
    .filter((s) => !s.voided)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  return (
    <Screen testID="week">
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={text.title}>{t.week.title}</Text>
        <SyncBanner />
        <Text testID="week-age" style={text.secondary}>
          {old === null ? t.week.never : t.week.updated(age(old, t.age))}
        </Text>
        {old !== null && old > STALE_MS && (
          <Text testID="week-stale" style={text.attention} accessibilityRole="alert">
            {t.week.stale}
          </Text>
        )}
        <Button
          testID="week-refresh"
          kind="secondary"
          label={syncing ? t.loading : t.week.refresh}
          disabled={syncing}
          onPress={() => void sync()}
        />

        {data !== null && days.length === 0 && (
          <Text testID="week-empty" style={text.body}>
            {t.week.empty}
          </Text>
        )}
        {days.map((day, d) => {
          const shifts = (data?.shifts ?? []).filter((s) => s.workDate === day);
          return (
            <View key={day} testID={`week-day-${d}`} style={styles.day}>
              <Text style={text.label}>
                {day === today ? `${t.week.today} · ` : ""}
                {dayName(day, language)}
              </Text>
              {shifts.map((shift, i) => {
                return (
                  <View key={shift.id} testID={`week-shift-${d}-${i}`} style={styles.row}>
                    <Text style={text.bodyStrong}>{shift.job.name}</Text>
                    <Text style={text.body}>
                      {wallTime(shift.start, language)}–{wallTime(shift.end, language)}
                    </Text>
                    {shift.job.address !== null && (
                      <Text style={text.secondary}>{shift.job.address}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {data !== null && (
          <View style={styles.day}>
            <Text style={text.label}>{t.week.hours}</Text>
            {sessions.length === 0 ? (
              <Text testID="hours-empty" style={text.body}>
                {t.week.noHours}
              </Text>
            ) : (
              sessions.map((s, i) => (
                <View key={s.rootEventId} testID={`hours-row-${i}`} style={styles.row}>
                  <Text style={text.secondary}>{dayName(s.workDate, language)}</Text>
                  <Text style={text.bodyStrong}>
                    {jobName.get(s.jobId) ?? "—"}: {duration(s.workedMs)}
                  </Text>
                  {s.endedAt === null && (
                    <Text style={[text.secondary, { color: color.pending }]}>
                      {t.week.open}
                    </Text>
                  )}
                  {unscheduled.has(s.rootEventId) && (
                    <Text
                      testID={`hours-unscheduled-${i}`}
                      style={[text.secondary, { color: color.pending }]}
                    >
                      {t.week.unscheduled}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[4], paddingBottom: space[6] },
  day: { gap: space[2] },
  row: {
    minHeight: size.target,
    justifyContent: "center",
    gap: space[1],
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
});
