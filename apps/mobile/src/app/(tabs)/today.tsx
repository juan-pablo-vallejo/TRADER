// Today: the clock (PRD, Time tracking; TASKS R5, S7). What it shows comes from the phone's
// own store — the last pull and the entries captured since — so it opens and works with no
// signal. A tap writes to the store and returns; sending is the sync layer's. Without the
// weekly schedule the person picks a jobsite of theirs; under it the clock offers the one
// shift the schedule makes eligible now, or says to ask the office. The server decides what
// counts either way, and an entry it stored for review or refused is shown as what it is.
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Pressable, StyleSheet, Text, View } from "react-native";

import { duration, timeOfDay, wallTime } from "../../format";
import { useStrings } from "../../i18n";
import type { Catalog } from "../../i18n/catalog";
import { offerAt, wallClock } from "../../sync/clock";
import { useSync } from "../../sync/provider";
import type { OutboxRecord } from "../../sync/types";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { SyncBanner } from "../../ui/sync-banner";

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
  if (record.standing !== "settled") return t.unsent;
  if (record.reasons.includes("unscheduled")) return t.reviewUnscheduled;
  if (record.reasons.includes("clock_skewed")) return t.reviewClock;
  return record.reasons.length > 0 ? t.review : null;
}

export default function Today() {
  const { t, language } = useStrings();
  const { snapshot, records, clock, last, tap, sync } = useSync();
  const [picked, setPicked] = useState<string | null>(null);
  // The minute moves the offer and the hours; nothing else on the screen needs a clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const data = snapshot?.data ?? null;
  const zone = data?.company.timezone ?? "UTC";
  const at = useMemo(() => wallClock(new Date(now), zone), [now, zone]);

  if (data === null) {
    return (
      <Screen testID="today">
        <Text style={text.title}>{t.today.title}</Text>
        {last === null ? (
          <Text testID="today-loading" style={text.body}>
            {t.loading}
          </Text>
        ) : (
          <>
            <Text testID="today-failed" style={text.attention} accessibilityRole="alert">
              {t.today.firstLoad}
            </Text>
            <Button
              testID="today-retry"
              kind="secondary"
              label={t.retry}
              onPress={() => void sync()}
            />
          </>
        )}
      </Screen>
    );
  }

  const jobs = data.jobs.filter((job) => job.status !== "archived");
  const names = new Map<string, string>([
    ...data.shifts.map((s) => [s.job.id, s.job.name] as const),
    ...data.jobs.map((j) => [j.id, j.name] as const),
  ]);
  const nameOf = (jobId: string) => names.get(jobId) ?? "—";
  const offer = data.scheduleEnforced ? offerAt(data.shifts, at.day, at.minute) : null;

  // Where a start or a switch would go: the eligible shift's jobsite under the schedule,
  // the picked jobsite without it (the only one, when there is only one).
  const current = clock.status === "off" ? null : clock.jobId;
  const choices = jobs.filter((job) => job.id !== current);
  const target =
    offer !== null
      ? offer.kind === "eligible" && offer.shift.job.id !== current
        ? offer.shift.job.id
        : null
      : (choices.find((job) => job.id === picked)?.id ??
        (choices.length === 1 && clock.status === "off" ? choices[0]!.id : null));

  const workedToday =
    data.sessions
      .filter((s) => s.workDate === at.day && !s.voided)
      .reduce(
        (sum, s) =>
          sum +
          s.workedMs +
          // A session still open has kept working since the pull.
          (s.endedAt === null && s.state === "working"
            ? Math.max(0, now - snapshot!.pulledAt)
            : 0),
        0,
      ) ?? 0;

  // Each with a testID numbered within its own kind: `entry-unsent-0` is the oldest entry
  // not sent, however many sent ones are listed before it.
  const seen = { refused: 0, review: 0, unsent: 0 };
  const noted = records.flatMap((record) => {
    const note = entryNote(record, t.entry);
    if (note === null) return [];
    const kind =
      record.standing === "rejected"
        ? "refused"
        : record.standing === "settled"
          ? "review"
          : "unsent";
    const testID = `entry-${kind}-${seen[kind]}`;
    seen[kind] += 1;
    return [{ record, note, testID }];
  });

  return (
    <Screen testID="today">
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={text.title}>{t.today.title}</Text>
        <SyncBanner />

        <View style={styles.card}>
          <Text testID={`clock-${clock.status}`} style={text.heading}>
            {clock.status === "off"
              ? t.today.off
              : clock.status === "paused"
                ? t.today.paused(nameOf(clock.jobId))
                : t.today.working(
                    nameOf(clock.jobId),
                    timeOfDay(clock.since, zone, language),
                  )}
          </Text>
          <Text testID="today-hours" style={text.secondary}>
            {t.today.hoursToday(duration(workedToday))}
          </Text>
        </View>

        {offer !== null && clock.status === "off" && (
          <Text
            testID={`offer-${offer.kind === "later" && offer.next === null ? "over" : offer.kind}`}
            style={offer.kind === "eligible" ? text.body : text.attention}
          >
            {offer.kind === "eligible"
              ? t.today.shiftNow(
                  offer.shift.job.name,
                  wallTime(offer.shift.start, language),
                  wallTime(offer.shift.end, language),
                )
              : offer.kind === "later"
                ? offer.next === null
                  ? t.today.noMoreShifts
                  : t.today.shiftLater(
                      offer.next.shift.job.name,
                      wallTime(offer.next.start, language),
                    )
                : offer.kind === "undecided"
                  ? t.today.undecided
                  : t.today.noShift}
          </Text>
        )}

        {clock.status === "off" && (
          <Button
            testID="clock-in"
            label={target === null ? t.today.clockIn : t.today.clockInAt(nameOf(target))}
            disabled={target === null}
            onPress={() => {
              if (target !== null) void tap({ action: "start", jobId: target });
            }}
          />
        )}
        {clock.status === "working" && (
          <>
            <Button
              testID="clock-out"
              label={t.today.clockOut}
              onPress={() => void tap({ action: "end" })}
            />
            <Button
              testID="clock-pause"
              kind="secondary"
              label={t.today.pause}
              onPress={() => void tap({ action: "pause" })}
            />
            {target !== null && (
              <Button
                testID="clock-switch"
                kind="secondary"
                label={t.today.switchTo(nameOf(target))}
                onPress={() => {
                  setPicked(null);
                  void tap({ action: "switch", jobId: target });
                }}
              />
            )}
          </>
        )}
        {clock.status === "paused" && (
          <>
            <Button
              testID="clock-resume"
              label={t.today.resume}
              onPress={() => void tap({ action: "resume" })}
            />
            <Button
              testID="clock-out"
              kind="secondary"
              label={t.today.clockOut}
              onPress={() => void tap({ action: "end" })}
            />
          </>
        )}

        {offer === null && clock.status !== "paused" && (
          <>
            <Text style={text.label}>{t.today.jobs}</Text>
            {jobs.length === 0 ? (
              <Text testID="today-empty" style={text.body}>
                {t.today.noJobs}
              </Text>
            ) : (
              <View testID="job-list" style={styles.list}>
                {jobs.map((job, index) => {
                  const on = job.id === current;
                  const chosen = job.id === target;
                  return (
                    <Pressable
                      key={job.id}
                      testID={`job-row-${index}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen, disabled: on }}
                      disabled={on}
                      onPress={() => setPicked(job.id)}
                      style={[styles.row, chosen && styles.chosen]}
                    >
                      <Text style={text.bodyStrong}>{job.name}</Text>
                      {job.address !== null && (
                        <Text style={text.secondary}>{job.address}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {noted.length > 0 && (
          <>
            <Text style={text.label}>{t.today.attention}</Text>
            <View style={styles.list}>
              {noted.map(({ record, note, testID }) => (
                <View key={record.id} testID={testID} style={styles.row}>
                  <Text style={text.bodyStrong}>
                    {t.entry.types[record.payload.type]} ·{" "}
                    {timeOfDay(record.payload.clientTimestamp, zone, language)} ·{" "}
                    {nameOf(record.payload.jobId)}
                  </Text>
                  <Text
                    style={
                      record.standing === "rejected" ? text.attention : text.secondary
                    }
                  >
                    {note}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[4], paddingBottom: space[6] },
  card: {
    gap: space[1],
    padding: space[4],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  list: { gap: space[2] },
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
  chosen: { borderWidth: 2, borderColor: color.accent },
});
