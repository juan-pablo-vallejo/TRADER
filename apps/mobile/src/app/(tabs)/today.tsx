// Today: the clock, around one button. What it shows comes from the phone's own store —
// the last pull and the entries captured since — so it opens and works with no signal. A
// tap writes to the store and returns; sending is the sync layer's.
//
// Off the clock: a card with the job, its address and the shift's hours, and one Clock in
// button at the foot of the screen. Under the weekly schedule the card is the shift the
// schedule makes eligible now and there is nothing to pick; with no such shift there is no
// button, the reason, and WhatsApp, a chat with the office. Without the schedule the person
// picks a jobsite first. On the clock: the job, a running timer, Clock out as the main
// button, Start break and Switch job beneath it. Clock out asks once; nothing else asks. A
// session left open from an earlier day says so first. The server decides what counts either way, and an
// entry it refused is shown behind the chip as what it is. With nothing loaded yet the
// screen says why (today.ts, nothingLoaded) and draws the chip. The timer is spoken as hours
// and minutes, and its size grows with the phone's text only as far as the screen's width.
import { wallClock, whatsAppLink } from "@trader/api/contract";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { announce, felt } from "../../feedback";
import { dayName, duration, timeOfDay, wallTime } from "../../format";
import { useSpeech, useStrings } from "../../i18n";
import { useReminders } from "../../reminders";
import { offerAt, type Tap } from "../../sync/clock";
import { useSync } from "../../sync/provider";
import {
  fromEarlierDay,
  nothingLoaded,
  sessionWorkedMs,
  spokenTimer,
  timer,
  workedOn,
} from "../../sync/today";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { JobSheet, type JobFacts } from "../../ui/job-sheet";
import { Sheet } from "../../ui/sheet";
import { SyncChip } from "../../ui/sync-chip";
import { Text } from "../../ui/text";

// How long the check mark stays after a tap was saved.
const CAPTURED_MS = 1600;
// How far the timer grows with the phone's text size.
const TIMER_GROWS = 1.25;

export default function Today() {
  const { t, language } = useStrings();
  const speech = useSpeech();
  const { snapshot, records, clock, last, refused, tap, sync } = useSync();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState<"clock-out" | "switch" | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  // A tap the store would not write: said until the next tap.
  const [notSaved, setNotSaved] = useState(false);
  const { setting: remindersSetting, turnOn, turnOff } = useReminders();
  const [askReminders, setAskReminders] = useState(false);
  const capturedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The second moves the timer while the clock runs; the minute moves the offer and the
  // hours otherwise. Nothing else on the screen needs a clock.
  const [now, setNow] = useState(() => Date.now());
  const running = clock.status === "working";
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), running ? 1000 : 20_000);
    return () => clearInterval(tick);
  }, [running]);
  useEffect(
    () => () => {
      if (capturedTimer.current !== null) clearTimeout(capturedTimer.current);
    },
    [],
  );

  const data = snapshot?.data ?? null;
  const zone = data?.company.timezone ?? "UTC";
  const at = useMemo(() => wallClock(new Date(now), zone), [now, zone]);

  if (data === null) {
    const reason = nothingLoaded(last, refused);
    const said = {
      offline: t.today.nothingLoaded.offline,
      failed: t.today.nothingLoaded.failed,
      update: t.today.nothingLoaded.update,
      paused: t.today.nothingLoaded.paused,
      sign_in: t.today.nothingLoaded.signIn,
    };
    return (
      <Screen testID="today">
        <View style={styles.head}>
          <Text style={text.title} accessibilityRole="header">
            {t.today.title}
          </Text>
          <SyncChip />
        </View>
        {reason === null ? (
          <Text testID="today-loading" style={text.body}>
            {t.loading}
          </Text>
        ) : (
          <>
            <Text
              testID={`today-failed-${reason}`}
              style={text.attention}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {said[reason]}
            </Text>
            {/* Trying again cannot update the app. */}
            {reason !== "update" && (
              <Button
                testID="today-retry"
                kind="secondary"
                label={t.retry}
                onPress={() => void sync()}
              />
            )}
          </>
        )}
      </Screen>
    );
  }

  // Every job the last pull named, a shift's own included: what a card and a sheet show.
  const facts = new Map<string, JobFacts>();
  for (const s of data.shifts) facts.set(s.job.id, s.job);
  for (const j of data.jobs) facts.set(j.id, j);
  const nameOf = (jobId: string) => facts.get(jobId)?.name ?? "—";

  const jobs = data.jobs.filter((job) => job.status !== "archived");
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
  // Under the schedule a switch has one place to go; without it, the person chooses.
  const switchTo: string[] =
    offer !== null ? (target === null ? [] : [target]) : choices.map((job) => job.id);

  // The day's hours count the running clock from the same marks as the timer (today.ts).
  const workedToday = workedOn(data, records, at.day, now);
  const session = sessionWorkedMs(data, records, clock, now);
  const earlier =
    clock.status !== "off" && fromEarlierDay(wallClock(clock.since, zone).day, at.day);

  // One capture: written to the store, answered with a check mark and a short haptic.
  // Neither waits on the network, and a phone with no haptics simply stays quiet. A write
  // the store refused is said, felt as an error and spoken; it was reported (capture.ts).
  const capture = async (what: Tap) => {
    const done = await tap(what);
    setNotSaved(done === "failed");
    if (done === "failed") {
      setCaptured(false);
      felt("error");
      announce(t.today.notSaved);
      return;
    }
    if (done !== "saved") return;
    // Asked once, after the first clock-in: the moment a reminder first makes sense.
    if (what.action === "start" && remindersSetting === null) setAskReminders(true);
    setCaptured(true);
    if (capturedTimer.current !== null) clearTimeout(capturedTimer.current);
    capturedTimer.current = setTimeout(() => setCaptured(false), CAPTURED_MS);
    felt("success");
  };

  // The card's job: the one the clock is on; else the one a start would go to.
  const cardJob = current ?? target;
  const card = cardJob === null ? null : (facts.get(cardJob) ?? null);
  const shift =
    offer?.kind === "eligible" && offer.shift.job.id === cardJob ? offer.shift : null;
  const officeChat = whatsAppLink(data.company.phone);
  const spoken = spokenTimer(session);
  const noShift = offer !== null && offer.kind !== "eligible" && clock.status === "off";
  const sheetJob = opened === null ? null : (facts.get(opened) ?? null);

  return (
    <Screen testID="today">
      <View style={styles.head}>
        <Text style={text.title} accessibilityRole="header">
          {t.today.title}
        </Text>
        <SyncChip />
      </View>

      <ScrollView style={styles.fill} contentContainerStyle={styles.page}>
        {clock.status !== "off" && earlier && (
          <View testID="today-earlier" style={styles.earlier} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={20} color={color.attentionInk} />
            <Text style={[text.body, styles.earlierText]}>
              {t.today.earlier(
                nameOf(clock.jobId),
                dayName(wallClock(clock.since, zone).day, language),
              )}
            </Text>
          </View>
        )}

        {card !== null && (
          <Pressable
            testID="job-card"
            accessibilityRole="button"
            accessibilityLanguage={speech}
            accessibilityLabel={[
              card.name,
              card.address,
              shift !== null && clock.status === "off"
                ? t.today.shiftHours(
                    wallTime(shift.start, language),
                    wallTime(shift.end, language),
                  )
                : null,
            ]
              .filter((part) => part !== null)
              .join(", ")}
            onPress={() => setOpened(card.id)}
            style={styles.card}
          >
            <View style={styles.cardHead}>
              <Text style={[text.heading, styles.fill]}>{card.name}</Text>
              <Ionicons name="chevron-forward" size={20} color={color.inkSecondary} />
            </View>
            {card.address !== null && <Text style={text.secondary}>{card.address}</Text>}
            {shift !== null && clock.status === "off" && (
              <Text testID="offer-eligible" style={text.bodyStrong}>
                {t.today.shiftHours(
                  wallTime(shift.start, language),
                  wallTime(shift.end, language),
                )}
              </Text>
            )}
          </Pressable>
        )}

        <View style={styles.status}>
          {clock.status === "off" ? (
            <Text testID="clock-off" style={text.body}>
              {t.today.off}
            </Text>
          ) : (
            <>
              <View style={styles.statusLine}>
                <Ionicons
                  name={clock.status === "paused" ? "pause-circle" : "time"}
                  size={20}
                  color={clock.status === "paused" ? color.attentionInk : color.activeInk}
                />
                <Text testID={`clock-${clock.status}`} style={text.bodyStrong}>
                  {clock.status === "paused" ? t.today.onBreak : t.today.onTheClock}
                </Text>
                {!earlier && (
                  <Text style={text.secondary}>
                    {t.today.since(timeOfDay(clock.since, zone, language))}
                  </Text>
                )}
              </View>
              <Text
                testID="clock-timer"
                accessibilityRole="timer"
                accessibilityLabel={t.today.timerSpoken(spoken.hours, spoken.minutes)}
                // At the phone's largest text "10:00:00" at 56 pt grown with it would run past
                // the screen: it grows a quarter at most, and shrinks to its one line.
                maxFontSizeMultiplier={TIMER_GROWS}
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.timer, clock.status === "paused" && styles.timerPaused]}
              >
                {timer(session)}
              </Text>
            </>
          )}
          <View style={styles.statusLine}>
            <Text testID="today-hours" style={text.secondary}>
              {t.today.hoursToday(duration(workedToday))}
            </Text>
            {captured && (
              <View
                testID="capture-saved"
                accessibilityLiveRegion="polite"
                accessibilityLabel={t.today.captured}
                style={styles.statusLine}
              >
                <Ionicons name="checkmark-circle" size={20} color={color.doneInk} />
                <Text style={[text.secondary, { color: color.doneInk }]}>
                  {t.today.captured}
                </Text>
              </View>
            )}
          </View>
          {notSaved && (
            <Text
              testID="capture-not-saved"
              style={text.attention}
              accessibilityRole="alert"
            >
              {t.today.notSaved}
            </Text>
          )}
        </View>

        {noShift && offer !== null && (
          <Text
            testID={`offer-${offer.kind === "later" && offer.next === null ? "over" : offer.kind}`}
            style={text.body}
          >
            {offer.kind === "later"
              ? offer.next === null
                ? t.today.noMoreShifts
                : t.today.shiftLater(
                    offer.next.shift.job.name,
                    wallTime(offer.next.start, language),
                  )
              : t.today.noShift}
          </Text>
        )}

        {offer === null && clock.status === "off" && (
          <>
            <Text style={text.label}>{t.today.jobs}</Text>
            {jobs.length === 0 ? (
              <Text testID="today-empty" style={text.body}>
                {t.today.noJobs}
              </Text>
            ) : (
              <View testID="job-list" accessibilityRole="radiogroup" style={styles.list}>
                {jobs.map((job, index) => {
                  const chosen = job.id === target;
                  return (
                    <Pressable
                      key={job.id}
                      testID={`job-row-${index}`}
                      accessibilityRole="radio"
                      accessibilityLanguage={speech}
                      accessibilityLabel={[job.name, job.address]
                        .filter((part) => part !== null)
                        .join(", ")}
                      accessibilityState={{ selected: chosen }}
                      onPress={() => setPicked(job.id)}
                      style={[styles.row, chosen && styles.chosen]}
                    >
                      <Ionicons
                        name={chosen ? "radio-button-on" : "radio-button-off"}
                        size={22}
                        color={chosen ? color.accent : color.controlBorder}
                      />
                      <View style={styles.fill}>
                        <Text style={text.bodyStrong}>{job.name}</Text>
                        {job.address !== null && (
                          <Text style={text.secondary}>{job.address}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* The foot of the screen: the one button, and what goes beneath it. */}
      <View style={[styles.foot, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
        {clock.status === "off" && !noShift && (
          <Button
            testID="clock-in"
            label={target === null ? t.today.clockIn : t.today.clockInAt(nameOf(target))}
            disabled={target === null}
            onPress={() => {
              if (target !== null) void capture({ action: "start", jobId: target });
            }}
          />
        )}
        {noShift && officeChat !== null && (
          <Button
            testID="whatsapp-office"
            label={t.today.whatsApp}
            spoken={t.today.whatsAppSpoken}
            onPress={() => void Linking.openURL(officeChat).catch(() => undefined)}
          />
        )}
        {clock.status === "working" && (
          <>
            <Button
              testID="clock-out"
              label={earlier ? t.today.clockOutNow : t.today.clockOut}
              onPress={() => setAsking("clock-out")}
            />
            <View style={styles.pair}>
              <View style={styles.fill}>
                <Button
                  testID="clock-pause"
                  kind="secondary"
                  label={t.today.pause}
                  onPress={() => void capture({ action: "pause" })}
                />
              </View>
              {switchTo.length > 0 && (
                <View style={styles.fill}>
                  <Button
                    testID="clock-switch"
                    kind="secondary"
                    label={t.today.switchJob}
                    onPress={() => setAsking("switch")}
                  />
                </View>
              )}
            </View>
          </>
        )}
        {clock.status === "paused" && (
          <>
            <Button
              testID="clock-resume"
              label={t.today.resume}
              onPress={() => void capture({ action: "resume" })}
            />
            <Button
              testID="clock-out"
              kind="secondary"
              label={earlier ? t.today.clockOutNow : t.today.clockOut}
              onPress={() => setAsking("clock-out")}
            />
          </>
        )}
      </View>

      {/* Clock out asks once, naming the job and the time worked. */}
      <Sheet
        visible={asking === "clock-out" && clock.status !== "off"}
        onClose={() => setAsking(null)}
        title={t.today.clockOutTitle}
        testID="clock-out-sheet"
      >
        {clock.status !== "off" && (
          <Text testID="clock-out-body" style={text.body}>
            {t.today.clockOutBody(duration(session), nameOf(clock.jobId))}
          </Text>
        )}
        <Button
          testID="clock-out-confirm"
          label={t.today.clockOut}
          onPress={() => {
            setAsking(null);
            void capture({ action: "end" });
          }}
        />
        <Button
          testID="clock-out-cancel"
          kind="secondary"
          label={t.today.keepWorking}
          onPress={() => setAsking(null)}
        />
      </Sheet>

      {/* Switch job: the choosing is the question; the tap on a jobsite is the answer. */}
      <Sheet
        visible={asking === "switch" && clock.status === "working"}
        onClose={() => setAsking(null)}
        title={t.today.switchTitle}
        testID="switch-sheet"
      >
        {switchTo.map((jobId, index) => (
          <Button
            key={jobId}
            testID={`switch-row-${index}`}
            kind="secondary"
            label={nameOf(jobId)}
            onPress={() => {
              setAsking(null);
              setPicked(null);
              void capture({ action: "switch", jobId });
            }}
          />
        ))}
        <Button
          testID="switch-cancel"
          kind="secondary"
          label={t.today.job.close}
          onPress={() => setAsking(null)}
        />
      </Sheet>

      <JobSheet job={sheetJob} onClose={() => setOpened(null)} />

      {/* One sentence of why, before the system's own question. Either answer is kept, so
          this is never asked again; Me has the switch. */}
      <Sheet
        visible={askReminders}
        onClose={() => {
          setAskReminders(false);
          void turnOff();
        }}
        title={t.reminders.label}
        testID="reminders-sheet"
      >
        <Text testID="reminders-why" style={text.body}>
          {t.reminders.why}
        </Text>
        <Button
          testID="reminders-turn-on"
          label={t.reminders.turnOn}
          onPress={() => {
            setAskReminders(false);
            void turnOn();
          }}
        />
        <Button
          testID="reminders-not-now"
          kind="secondary"
          label={t.reminders.notNow}
          onPress={() => {
            setAskReminders(false);
            void turnOff();
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: space[2] },
  page: { gap: space[4], paddingBottom: space[4] },
  earlier: {
    flexDirection: "row",
    gap: space[2],
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.attentionTint,
  },
  earlierText: { flex: 1, color: color.attentionInk },
  card: {
    gap: space[1],
    padding: space[4],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  status: { gap: space[1] },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexWrap: "wrap",
  },
  timer: {
    fontSize: 56,
    lineHeight: 64,
    fontWeight: "600",
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  timerPaused: { color: color.inkSecondary },
  list: { gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: size.target,
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  chosen: { borderColor: color.accent, backgroundColor: color.accentTint },
  foot: { gap: space[2] },
  pair: { flexDirection: "row", gap: space[2] },
});
