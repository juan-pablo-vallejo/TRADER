// Week: the person's own shifts and their own hours. Read-only, from the last pull, and it
// says how old that pull is: a schedule the office changed while this phone was offline is
// not known here until the next one, so an old one says it may be out of date.
//
// Each scheduled day is a card, today first; a shift opens the same job sheet as Today.
// Beneath, the hours by day as the server folds them, each with a flag in words where the
// office may look. Nothing here is computed on the phone but the grouping (sync/week.ts).
import { wallClock } from "@trader/api/contract";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { age, dayName, duration, wallTime } from "../../format";
import { useStrings } from "../../i18n";
import { useSync } from "../../sync/provider";
import { hoursByDay, shiftDays } from "../../sync/week";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { JobSheet, type JobFacts } from "../../ui/job-sheet";
import { SyncChip } from "../../ui/sync-chip";

// Older than this, the schedule on the phone is said to be possibly out of date.
const STALE_MS = 60 * 60_000;

export default function Week() {
  const { t, language } = useStrings();
  const { snapshot, sync, syncing } = useSync();
  const [opened, setOpened] = useState<JobFacts | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const data = snapshot?.data ?? null;
  const old = snapshot === null ? null : now - snapshot.pulledAt;
  const today =
    data === null ? null : wallClock(new Date(now), data.company.timezone).day;
  const days = data === null || today === null ? [] : shiftDays(data, today);
  const hours = data === null ? [] : hoursByDay(data);
  const jobName = new Map<string, string>([
    ...(data?.shifts ?? []).map((s) => [s.job.id, s.job.name] as const),
    ...(data?.jobs ?? []).map((j) => [j.id, j.name] as const),
  ]);
  // Numbered across the whole list, newest first: `hours-row-0` is the latest session.
  let row = 0;

  return (
    <Screen testID="week">
      <View style={styles.head}>
        <Text style={text.title}>{t.week.title}</Text>
        <SyncChip />
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.age}>
          <View style={styles.fill}>
            <Text testID="week-age" style={text.secondary}>
              {old === null ? t.week.never : t.week.updated(age(old, t.age))}
            </Text>
            {old !== null && old > STALE_MS && (
              <Text testID="week-stale" style={text.attention} accessibilityRole="alert">
                {t.week.stale}
              </Text>
            )}
          </View>
          <Button
            testID="week-refresh"
            kind="secondary"
            label={syncing ? t.loading : t.week.refresh}
            disabled={syncing}
            onPress={() => void sync()}
          />
        </View>

        {data !== null && days.length === 0 && (
          <Text testID="week-empty" style={text.body}>
            {t.week.empty}
          </Text>
        )}
        {days.map(({ day, shifts }, d) => (
          <View
            key={day}
            testID={`week-day-${d}`}
            style={[styles.card, day === today && styles.today]}
          >
            <Text style={[text.label, day === today && { color: color.accent }]}>
              {day === today ? `${t.week.today} · ` : ""}
              {dayName(day, language)}
            </Text>
            {shifts.map((shift, i) => (
              <Pressable
                key={shift.id}
                testID={`week-shift-${d}-${i}`}
                accessibilityRole="button"
                onPress={() => setOpened(shift.job)}
                style={styles.shift}
              >
                <View style={styles.fill}>
                  <Text style={text.bodyStrong}>{shift.job.name}</Text>
                  <Text style={[text.body, styles.figures]}>
                    {t.today.shiftHours(
                      wallTime(shift.start, language),
                      wallTime(shift.end, language),
                    )}
                  </Text>
                  {shift.job.address !== null && (
                    <Text style={text.secondary}>{shift.job.address}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={color.inkSecondary} />
              </Pressable>
            ))}
          </View>
        ))}

        {data !== null && (
          <View style={styles.hours}>
            <Text style={text.heading}>{t.week.hours}</Text>
            {hours.length === 0 ? (
              <Text testID="hours-empty" style={text.body}>
                {t.week.noHours}
              </Text>
            ) : (
              hours.map(({ day, workedMs, sessions }) => (
                <View key={day} style={styles.card}>
                  <View style={styles.dayHead}>
                    <Text style={[text.label, styles.fill]}>
                      {dayName(day, language)}
                    </Text>
                    <Text style={[text.secondary, styles.figures]}>
                      {t.week.dayTotal(duration(workedMs))}
                    </Text>
                  </View>
                  {[...sessions].reverse().map(({ session, flags }) => {
                    const i = row;
                    row += 1;
                    return (
                      <View key={session.rootEventId} testID={`hours-row-${i}`}>
                        <View style={styles.dayHead}>
                          <Text style={[text.body, styles.fill]}>
                            {jobName.get(session.jobId) ?? "—"}
                          </Text>
                          <Text style={[text.bodyStrong, styles.figures]}>
                            {duration(session.workedMs)}
                          </Text>
                        </View>
                        {session.endedAt === null && (
                          <Text style={[text.secondary, { color: color.activeInk }]}>
                            {t.week.open}
                          </Text>
                        )}
                        {flags.map((flag) => (
                          <View key={flag} style={styles.flag}>
                            <Ionicons
                              name="flag-outline"
                              size={16}
                              color={color.attentionInk}
                            />
                            <Text
                              testID={
                                flag === "unscheduled"
                                  ? `hours-unscheduled-${i}`
                                  : `hours-flag-${i}-${flag}`
                              }
                              style={[text.secondary, styles.flagText]}
                            >
                              {flag === "unscheduled"
                                ? t.week.unscheduled
                                : t.week.flags[flag]}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <JobSheet job={opened} onClose={() => setOpened(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: space[2] },
  page: { gap: space[4], paddingBottom: space[6] },
  age: { flexDirection: "row", alignItems: "center", gap: space[3] },
  card: {
    gap: space[2],
    padding: space[4],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  today: { borderColor: color.accent },
  shift: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: size.target,
  },
  hours: { gap: space[2] },
  dayHead: { flexDirection: "row", alignItems: "baseline", gap: space[2] },
  figures: { fontVariant: ["tabular-nums"] },
  flag: { flexDirection: "row", alignItems: "flex-start", gap: space[1] },
  flagText: { flex: 1, color: color.attentionInk },
});
