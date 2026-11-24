// Crew: the company's today, for an admin on a jobsite. Who is on the clock, on a break,
// expected, late or done, by person or by jobsite; a person's sheet to call them, add a
// shift for today or move them to another jobsite; a jobsite's sheet to see who is there
// and to set its location to where the admin stands.
//
// Online only. It is other people's day, read from the server when the tab is in front
// and every minute after, and never kept on the phone: when the server cannot be reached
// the tab says so and shows nothing, because an hour-old "on the clock" read as current
// is worse than no answer. Every write here is the office's own procedure
// (`assignment.create`, `assignment.moveToday`, `job.update`), made with a connection.
//
// A status is named by the one function the office shares (`@trader/api/contract`,
// crewStatus). The forms always carry an end time: `assignment.moveToday` answers
// `end_required` without one when no shift covers the minute.
import { Ionicons } from "@expo/vector-icons";
import {
  CREW_STATUSES,
  crewCounts,
  crewStatus,
  type CrewStatus,
} from "@trader/api/contract";
import * as Crypto from "expo-crypto";
import { Redirect, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { createApi } from "../../api";
import { apiUrl } from "../../config";
import { dayName, duration, timeOfDay, wallTime } from "../../format";
import { useStrings } from "../../i18n";
import { createMinter } from "../../ids";
import { currentFix } from "../../location";
import { headersFor, useSession } from "../../session";
import { wallClock } from "../../sync/clock";
import {
  byJob,
  coveringShift,
  offeredEnd,
  quarterAfter,
  refusalOf,
  stepTime,
  type Crew,
  type CrewPerson,
  type Refusal,
} from "../../sync/crew";
import { CYCLE_MS, useSync } from "../../sync/provider";
import { mapsLink, telLink } from "../../sync/today";
import { color, size, space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { Sheet } from "../../ui/sheet";

// The radius a jobsite gets when its location is set from the phone.
export const SET_RADIUS_M = 200;

const mint = createMinter((count) => Crypto.getRandomBytes(count));

type Load = { phase: "loading" } | { phase: "offline" } | { phase: "ready"; crew: Crew };

type Open =
  | null
  | { kind: "person"; id: string }
  // `personId` null: opened from the tab itself, and the form asks who.
  | { kind: "add"; personId: string | null }
  | { kind: "move"; personId: string }
  | { kind: "job"; id: string }
  | { kind: "locate"; id: string };

type Problem = Refusal | "pickPerson" | "pickJob" | "noFix";

// A tone and an icon per status: never color alone, the word is always beside them.
const TONE: Record<
  CrewStatus,
  { ink: string; tint: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  working: { ink: color.activeInk, tint: color.activeTint, icon: "time" },
  break: { ink: color.neutralInk, tint: color.neutralTint, icon: "cafe-outline" },
  late: {
    ink: color.attentionInk,
    tint: color.attentionTint,
    icon: "alert-circle-outline",
  },
  expected: { ink: color.neutralInk, tint: color.neutralTint, icon: "hourglass-outline" },
  done: { ink: color.doneInk, tint: color.doneTint, icon: "checkmark-circle-outline" },
};

function StatusPill({
  status,
  label,
  testID,
}: {
  status: CrewStatus;
  label: string;
  testID: string;
}) {
  const tone = TONE[status];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: tone.tint }]}>
      <Ionicons name={tone.icon} size={18} color={tone.ink} />
      <Text style={[text.secondary, styles.pillText, { color: tone.ink }]}>{label}</Text>
    </View>
  );
}

// One of a few: a row that is chosen or not, as a radio button reads.
function Choice({
  label,
  chosen,
  testID,
  onPress,
}: {
  label: string;
  chosen: boolean;
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      // The label alone: the icon is a glyph, and would be read out as one.
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      style={[styles.choice, chosen && styles.chosen]}
    >
      <Ionicons
        name={chosen ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={chosen ? color.accent : color.controlBorder}
      />
      <Text style={[text.body, styles.fill]}>{label}</Text>
    </Pressable>
  );
}

// A time of day moved a quarter hour at a tap: no keyboard, and nothing to mistype with
// paint on a thumb.
function TimeStepper({
  label,
  value,
  language,
  testID,
  earlier,
  later,
  onChange,
}: {
  label: string;
  value: string;
  language: string;
  testID: string;
  earlier: string;
  later: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={text.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          testID={`${testID}-earlier`}
          accessibilityRole="button"
          accessibilityLabel={earlier}
          onPress={() => onChange(stepTime(value, -1))}
          style={styles.step}
        >
          <Ionicons name="remove" size={24} color={color.ink} />
        </Pressable>
        <Text
          testID={testID}
          style={[text.heading, styles.time]}
          accessibilityLabel={`${label}: ${wallTime(value, language)}`}
        >
          {wallTime(value, language)}
        </Text>
        <Pressable
          testID={`${testID}-later`}
          accessibilityRole="button"
          accessibilityLabel={later}
          onPress={() => onChange(stepTime(value, 1))}
          style={styles.step}
        >
          <Ionicons name="add" size={24} color={color.ink} />
        </Pressable>
      </View>
    </View>
  );
}

export default function CrewTab() {
  const { t, language } = useStrings();
  const { session } = useSession();
  const { snapshot } = useSync();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"person" | "job">("person");
  const [open, setOpen] = useState<Open>(null);
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState<string | null>(null);
  // The forms' fields. One form is open at a time, so one set serves both.
  const [personId, setPersonId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("15:30");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState<{ id: string; name: string }[] | null>(null);

  const api = useMemo(
    () => (apiUrl === null ? null : createApi(apiUrl, () => headersFor(session))),
    [session],
  );
  const admin = snapshot?.data.me.role === "admin";

  // The newest request's answer is the one shown: an older one that lands late is dropped.
  const asked = useRef(0);
  const refresh = useCallback(async () => {
    if (api === null) return setLoad({ phase: "offline" });
    const mine = ++asked.current;
    setBusy(true);
    try {
      const crew = await api.overview.today.query();
      if (mine === asked.current) setLoad({ phase: "ready", crew });
    } catch {
      // Nothing old is left standing as current, a note about the list included.
      if (mine === asked.current) {
        setLoad({ phase: "offline" });
        setNote(null);
      }
    } finally {
      if (mine === asked.current) setBusy(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (!admin) return undefined;
      void refresh();
      const timer = setInterval(() => void refresh(), CYCLE_MS);
      return () => clearInterval(timer);
    }, [admin, refresh]),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (snapshot !== null && !admin) return <Redirect href="/today" />;

  const crew = load.phase === "ready" ? load.crew : null;
  const zone = crew?.timezone ?? snapshot?.data.company.timezone ?? "UTC";
  const minute = wallClock(new Date(now), zone).minute;
  const counts = crew === null ? null : crewCounts(crew.people, minute);
  const jobName = new Map<string, string>([
    ...(snapshot?.data.jobs ?? []).map((j) => [j.id, j.name] as const),
    ...(crew?.jobs ?? []).map((j) => [j.id, j.name] as const),
  ]);
  const nameOf = (id: string) => jobName.get(id) ?? "";
  // Every jobsite a shift may name: the pull's, open ones only.
  const openJobs = (snapshot?.data.jobs ?? [])
    .filter((j) => j.status === "open")
    .sort((a, b) => a.name.localeCompare(b.name));
  const groups = crew === null ? [] : byJob(crew, minute);

  const opened =
    open !== null && (open.kind === "person" || open.kind === "move")
      ? (crew?.people.find(
          (p) => p.person.id === (open.kind === "person" ? open.id : open.personId),
        ) ?? null)
      : null;
  const openedJob =
    open !== null && (open.kind === "job" || open.kind === "locate")
      ? (groups.find((g) => g.job.id === open.id) ?? null)
      : null;
  const covering = opened === null ? null : coveringShift(opened, minute);
  const close = () => {
    setOpen(null);
    setProblem(null);
  };

  const statusLabel = (status: CrewStatus) => t.crew.status[status];
  const line = (person: CrewPerson): string => {
    if (person.clock.status !== "off") {
      return `${nameOf(person.clock.jobId)} · ${t.today.since(
        timeOfDay(person.clock.since, zone, language),
      )}`;
    }
    const next = person.shifts.find((s) => !s.clockedIn) ?? person.shifts.at(-1);
    return next === undefined
      ? t.crew.noShift
      : `${nameOf(next.jobId)} · ${wallTime(next.start, language)} – ${wallTime(next.end, language)}`;
  };
  const workedNow = (person: CrewPerson) =>
    person.workedMs +
    (crew !== null && person.clock.status === "working"
      ? Math.max(0, now - crew.asOf.getTime())
      : 0);

  const openAdd = (forPerson: string | null) => {
    const from = quarterAfter(minute);
    setPersonId(forPerson);
    setJobId(null);
    setStart(from);
    setEnd(offeredEnd(from));
    setProblem(null);
    setNote(null);
    setOpen({ kind: "add", personId: forPerson });
    if (forPerson === null && api !== null) {
      setRoster(null);
      void api.roster.list
        .query()
        .then((all) =>
          setRoster(
            all
              .filter((u) => u.deactivatedAt === null)
              .map((u) => ({ id: u.id, name: u.name }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ),
        )
        .catch(() => setProblem("failed"));
    }
  };
  const openMove = (person: CrewPerson) => {
    setJobId(null);
    setEnd(coveringShift(person, minute)?.end ?? offeredEnd(minute));
    setProblem(null);
    setNote(null);
    setOpen({ kind: "move", personId: person.person.id });
  };

  const written = async (said: string) => {
    setOpen(null);
    setProblem(null);
    setNote(said);
    await refresh();
  };

  const saveAdd = async () => {
    if (api === null || crew === null) return setProblem("failed");
    if (personId === null) return setProblem("pickPerson");
    if (jobId === null) return setProblem("pickJob");
    setSaving(true);
    try {
      const answer = await api.assignment.create.mutate({
        userId: personId,
        jobId,
        expectedStart: start,
        expectedEnd: end,
        days: [{ id: mint(Date.now()), workDate: crew.today }],
      });
      const refusal = refusalOf(answer.result === "planned" ? answer.days[0] : answer);
      if (refusal !== null) return setProblem(refusal);
      await written(t.crew.form.added);
    } catch {
      setProblem("failed");
    } finally {
      setSaving(false);
    }
  };

  const saveMove = async () => {
    if (api === null || open?.kind !== "move") return setProblem("failed");
    if (jobId === null) return setProblem("pickJob");
    // The minute is read at the tap, not when the form opened.
    const at = wallClock(new Date(), zone).minute;
    setSaving(true);
    try {
      const answer = await api.assignment.moveToday.mutate({
        id: mint(Date.now()),
        userId: open.personId,
        jobId,
        at,
        // Always: with no shift covering the minute the server has no end to inherit.
        expectedEnd: end > at ? end : offeredEnd(at),
      });
      const refusal = refusalOf(answer);
      if (refusal !== null) return setProblem(refusal);
      await written(t.crew.form.moved);
    } catch {
      setProblem("failed");
    } finally {
      setSaving(false);
    }
  };

  const setLocation = async (id: string) => {
    if (api === null) return setProblem("failed");
    setSaving(true);
    setProblem(null);
    try {
      const fix = await currentFix();
      if (fix === null) return setProblem("noFix");
      // The place alone (M6): job.setLocation writes nothing the office typed.
      const answer = await api.job.setLocation.mutate({
        jobId: id,
        location: { ...fix, radiusM: SET_RADIUS_M },
      });
      if (answer.result !== "updated") return setProblem("failed");
      await written(t.crew.job.set);
    } catch {
      setProblem("failed");
    } finally {
      setSaving(false);
    }
  };

  const problemText = (p: Problem): string =>
    p === "pickPerson"
      ? t.crew.form.pickPerson
      : p === "pickJob"
        ? t.crew.form.pickJob
        : p === "noFix"
          ? t.crew.job.noFix
          : t.crew.refusal[p];
  const said = problem !== null && (
    <Text testID="crew-problem" style={text.attention} accessibilityRole="alert">
      {problemText(problem)}
    </Text>
  );
  const jobChoices =
    openJobs.length === 0 ? (
      <Text style={text.secondary}>{t.crew.form.noJobs}</Text>
    ) : (
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {openJobs.map((j, i) => (
          <Choice
            key={j.id}
            testID={`form-job-${i}`}
            label={j.name}
            chosen={jobId === j.id}
            onPress={() => setJobId(j.id)}
          />
        ))}
      </View>
    );

  const personRow = (
    person: CrewPerson,
    status: CrewStatus,
    index: number,
    prefix: string,
  ) => (
    <Pressable
      key={`${prefix}-${person.person.id}`}
      testID={`${prefix}-${index}`}
      accessibilityRole="button"
      accessibilityLabel={`${person.person.name}, ${statusLabel(status)}, ${line(person)}`}
      onPress={() => {
        setNote(null);
        setOpen({ kind: "person", id: person.person.id });
      }}
      style={styles.row}
    >
      <View style={styles.fill}>
        <Text style={text.bodyStrong}>{person.person.name}</Text>
        <Text style={text.secondary}>{line(person)}</Text>
      </View>
      <StatusPill
        status={status}
        label={statusLabel(status)}
        testID={`${prefix}-${index}-${status}`}
      />
      <Ionicons name="chevron-forward" size={20} color={color.inkSecondary} />
    </Pressable>
  );

  // What the one sheet is showing: nothing when its person or jobsite left the answer.
  const sheets = {
    person:
      opened !== null ? { title: opened.person.name, testID: "person-sheet" } : null,
    add: { title: t.crew.form.addTitle, testID: "add-sheet" },
    move:
      opened !== null
        ? {
            title: t.crew.form.moveTitle(opened.person.name),
            testID: "move-sheet",
          }
        : null,
    job:
      openedJob !== null ? { title: openedJob.job.name, testID: "crew-job-sheet" } : null,
    locate:
      openedJob !== null
        ? { title: t.crew.job.confirmTitle, testID: "locate-sheet" }
        : null,
  };
  const sheet = open === null ? null : sheets[open.kind];

  return (
    <Screen testID="crew">
      <View style={styles.head}>
        <Text style={text.title}>{t.crew.title}</Text>
        <Button
          testID="crew-refresh"
          kind="secondary"
          label={busy ? t.loading : t.crew.refresh}
          disabled={busy}
          onPress={() => void refresh()}
        />
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {load.phase === "loading" && <Text style={text.secondary}>{t.loading}</Text>}
        {load.phase === "offline" && (
          <View testID="crew-offline" style={styles.card}>
            <Ionicons name="cloud-offline-outline" size={28} color={color.inkSecondary} />
            <Text style={text.body} accessibilityRole="alert">
              {t.crew.offline}
            </Text>
          </View>
        )}
        {note !== null && (
          <Text
            testID="crew-note"
            style={[text.secondary, styles.note]}
            accessibilityRole="alert"
          >
            {note}
          </Text>
        )}
        {crew !== null && counts !== null && (
          <>
            <View style={styles.counts}>
              {CREW_STATUSES.map((status) => (
                <StatusPill
                  key={status}
                  status={status}
                  testID={`crew-count-${status}`}
                  label={`${counts[status]} ${statusLabel(status)}`}
                />
              ))}
            </View>

            {crew.earlier.length > 0 && (
              <View testID="crew-earlier" style={[styles.card, styles.attention]}>
                <Text style={text.bodyStrong}>{t.crew.earlierTitle}</Text>
                {crew.earlier.map((e, i) => {
                  const dial = telLink(e.person.phone);
                  return (
                    <View key={e.person.id} style={styles.earlier}>
                      <View style={styles.fill}>
                        <Text style={text.bodyStrong}>{e.person.name}</Text>
                        <Text style={text.secondary}>
                          {t.crew.earlierRow(
                            nameOf(e.jobId),
                            dayName(e.sinceDay, language),
                          )}
                        </Text>
                      </View>
                      {dial !== null && (
                        <Button
                          testID={`crew-earlier-call-${i}`}
                          kind="secondary"
                          label={t.crew.person.call}
                          onPress={() =>
                            void Linking.openURL(dial).catch(() => undefined)
                          }
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View accessibilityRole="radiogroup" style={styles.views}>
              {(["person", "job"] as const).map((which) => (
                <Pressable
                  key={which}
                  testID={`crew-view-${which}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: view === which }}
                  onPress={() => setView(which)}
                  style={[styles.view, view === which && styles.viewOn]}
                >
                  <Text
                    style={[text.bodyStrong, view === which && { color: color.onAccent }]}
                  >
                    {which === "person" ? t.crew.byPerson : t.crew.byJob}
                  </Text>
                </Pressable>
              ))}
            </View>

            {crew.people.length === 0 && (
              <Text testID="crew-empty" style={text.secondary}>
                {t.crew.empty}
              </Text>
            )}

            {view === "person" && crew.people.length > 0 && (
              <View style={styles.list}>
                {crew.people.map((p, i) =>
                  personRow(p, crewStatus(p, minute), i, "crew-person"),
                )}
              </View>
            )}

            {view === "job" &&
              groups.map((g, i) => (
                <Pressable
                  key={g.job.id}
                  testID={`crew-job-${i}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setNote(null);
                    setOpen({ kind: "job", id: g.job.id });
                  }}
                  style={styles.card}
                >
                  <View style={styles.jobHead}>
                    <Text style={[text.bodyStrong, styles.fill]}>{g.job.name}</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={color.inkSecondary}
                    />
                  </View>
                  {[...g.here, ...g.scheduled].map(({ person, status }) => (
                    <View key={person.person.id} style={styles.jobPerson}>
                      <Text style={[text.body, styles.fill]}>{person.person.name}</Text>
                      <StatusPill
                        status={status}
                        label={statusLabel(status)}
                        testID={`crew-job-${i}-${status}`}
                      />
                    </View>
                  ))}
                </Pressable>
              ))}

            <Button
              testID="crew-add"
              kind="secondary"
              label={t.crew.addAny}
              onPress={() => openAdd(null)}
            />
          </>
        )}
      </ScrollView>

      {/* One sheet, whose content changes: two modals trading places do not both show. */}
      <Sheet
        visible={sheet !== null}
        onClose={close}
        title={sheet?.title ?? ""}
        testID={sheet?.testID ?? "crew-sheet"}
      >
        {open?.kind === "person" && (
          <>
            {opened !== null && open?.kind === "person" && (
              <>
                <View style={styles.sheetStatus}>
                  <StatusPill
                    status={crewStatus(opened, minute)}
                    label={statusLabel(crewStatus(opened, minute))}
                    testID={`person-status-${crewStatus(opened, minute)}`}
                  />
                  {opened.clock.status !== "off" && (
                    <Text style={[text.secondary, styles.fill]}>
                      {t.crew.person.at(nameOf(opened.clock.jobId))} ·{" "}
                      {t.today.since(timeOfDay(opened.clock.since, zone, language))}
                    </Text>
                  )}
                </View>
                <Text testID="person-hours" style={text.body}>
                  {t.today.hoursToday(duration(workedNow(opened)))}
                </Text>
                <Text style={text.label}>{t.crew.person.shifts}</Text>
                {opened.shifts.length === 0 ? (
                  <Text testID="person-no-shifts" style={text.secondary}>
                    {t.crew.person.noShifts}
                  </Text>
                ) : (
                  opened.shifts.map((s, i) => (
                    <Text key={s.id} testID={`person-shift-${i}`} style={text.body}>
                      {nameOf(s.jobId)} · {wallTime(s.start, language)} –{" "}
                      {wallTime(s.end, language)}
                    </Text>
                  ))
                )}
                {telLink(opened.person.phone) === null ? (
                  <Text testID="person-no-phone" style={text.secondary}>
                    {t.crew.person.noPhone}
                  </Text>
                ) : (
                  <Button
                    testID="person-call"
                    label={t.crew.person.call}
                    onPress={() =>
                      void Linking.openURL(telLink(opened.person.phone)!).catch(
                        () => undefined,
                      )
                    }
                  />
                )}
                <Button
                  testID="person-add"
                  kind="secondary"
                  label={t.crew.person.add}
                  onPress={() => openAdd(opened.person.id)}
                />
                <Button
                  testID="person-move"
                  kind="secondary"
                  label={t.crew.person.move}
                  onPress={() => openMove(opened)}
                />
              </>
            )}
            <Button
              testID="person-close"
              kind="secondary"
              label={t.crew.person.close}
              onPress={close}
            />
          </>
        )}
        {open?.kind === "add" && (
          <>
            {open?.kind === "add" && (
              <>
                {open.personId === null ? (
                  <>
                    <Text style={text.label}>{t.crew.form.who}</Text>
                    {roster === null ? (
                      <Text style={text.secondary}>{t.loading}</Text>
                    ) : (
                      <View accessibilityRole="radiogroup" style={styles.choices}>
                        {roster.map((u, i) => (
                          <Choice
                            key={u.id}
                            testID={`form-person-${i}`}
                            label={u.name}
                            chosen={personId === u.id}
                            onPress={() => setPersonId(u.id)}
                          />
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text testID="form-for" style={text.bodyStrong}>
                    {crew?.people.find((p) => p.person.id === open.personId)?.person
                      .name ?? ""}
                  </Text>
                )}
                <Text style={text.label}>{t.crew.form.job}</Text>
                {jobChoices}
                <TimeStepper
                  testID="form-start"
                  label={t.crew.form.start}
                  value={start}
                  language={language}
                  earlier={t.crew.form.earlier(t.crew.form.start)}
                  later={t.crew.form.later(t.crew.form.start)}
                  onChange={(next) => {
                    setStart(next);
                    if (end <= next) setEnd(offeredEnd(next));
                  }}
                />
                <TimeStepper
                  testID="form-end"
                  label={t.crew.form.end}
                  value={end}
                  language={language}
                  earlier={t.crew.form.earlier(t.crew.form.end)}
                  later={t.crew.form.later(t.crew.form.end)}
                  onChange={(next) => setEnd(next > start ? next : end)}
                />
                {said}
                <Button
                  testID="form-save"
                  label={saving ? t.loading : t.crew.form.addSave}
                  disabled={saving}
                  onPress={() => void saveAdd()}
                />
              </>
            )}
            <Button
              testID="form-cancel"
              kind="secondary"
              label={t.crew.form.cancel}
              onPress={close}
            />
          </>
        )}
        {open?.kind === "move" && (
          <>
            {open?.kind === "move" && opened !== null && (
              <>
                <Text testID="move-from" style={text.body}>
                  {t.crew.form.moveFrom(wallTime(minute, language))}
                </Text>
                <Text style={text.label}>{t.crew.form.job}</Text>
                {jobChoices}
                {covering !== null ? (
                  // The new shift takes the end of the one they are on: said, not asked.
                  <Text testID="move-end-kept" style={text.body}>
                    {t.crew.form.moveEndKept(wallTime(covering.end, language))}
                  </Text>
                ) : (
                  <TimeStepper
                    testID="form-end"
                    label={t.crew.form.end}
                    value={end}
                    language={language}
                    earlier={t.crew.form.earlier(t.crew.form.end)}
                    later={t.crew.form.later(t.crew.form.end)}
                    onChange={(next) => setEnd(next > minute ? next : end)}
                  />
                )}
                <Text style={text.secondary}>{t.crew.form.moveTell}</Text>
                {said}
                <Button
                  testID="form-save"
                  label={saving ? t.loading : t.crew.form.moveSave}
                  disabled={saving}
                  onPress={() => void saveMove()}
                />
              </>
            )}
            <Button
              testID="form-cancel"
              kind="secondary"
              label={t.crew.form.cancel}
              onPress={close}
            />
          </>
        )}
        {open?.kind === "job" && (
          <>
            {open?.kind === "job" && openedJob !== null && (
              <>
                <Text style={text.label}>{t.crew.job.here}</Text>
                {openedJob.here.length === 0 ? (
                  <Text testID="job-nobody" style={text.secondary}>
                    {t.crew.job.nobodyHere}
                  </Text>
                ) : (
                  openedJob.here.map(({ person, status }, i) =>
                    personRow(person, status, i, "job-here"),
                  )
                )}
                {openedJob.scheduled.length > 0 && (
                  <>
                    <Text style={text.label}>{t.crew.job.scheduled}</Text>
                    {openedJob.scheduled.map(({ person, status }, i) =>
                      personRow(person, status, i, "job-scheduled"),
                    )}
                  </>
                )}
                <Text style={text.label}>{t.today.job.address}</Text>
                {openedJob.job.address === null ? (
                  <Text style={text.secondary}>{t.today.job.noAddress}</Text>
                ) : (
                  <>
                    <Text testID="crew-job-address" style={text.body} selectable>
                      {openedJob.job.address}
                    </Text>
                    <Button
                      testID="crew-job-maps"
                      kind="secondary"
                      label={t.today.job.openMaps}
                      onPress={() =>
                        void Linking.openURL(
                          mapsLink(openedJob.job.address!, Platform.OS),
                        ).catch(() => undefined)
                      }
                    />
                  </>
                )}
                <Text
                  testID={
                    openedJob.job.location === null ? "job-not-located" : "job-located"
                  }
                  style={text.secondary}
                >
                  {openedJob.job.location === null
                    ? t.crew.job.notLocated
                    : t.crew.job.located}
                </Text>
                <Button
                  testID="job-set-location"
                  kind="secondary"
                  label={t.crew.job.setLocation}
                  onPress={() => {
                    setProblem(null);
                    setOpen({ kind: "locate", id: openedJob.job.id });
                  }}
                />
              </>
            )}
            <Button
              testID="crew-job-close"
              kind="secondary"
              label={t.crew.person.close}
              onPress={close}
            />
          </>
        )}
        {open?.kind === "locate" && (
          <>
            {open?.kind === "locate" && openedJob !== null && (
              <>
                <Text testID="locate-body" style={text.body}>
                  {t.crew.job.confirmBody(openedJob.job.name)}
                </Text>
                {said}
                <Button
                  testID="locate-confirm"
                  label={saving ? t.crew.job.locating : t.crew.job.confirm}
                  disabled={saving}
                  onPress={() => void setLocation(openedJob.job.id)}
                />
              </>
            )}
            <Button
              testID="locate-cancel"
              kind="secondary"
              label={t.crew.form.cancel}
              onPress={close}
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  page: { gap: space[4], paddingBottom: space[6] },
  note: { color: color.doneInk },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: 999,
  },
  pillText: { fontWeight: "600" },
  card: {
    gap: space[2],
    padding: space[4],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  attention: { borderColor: color.attentionInk },
  earlier: { flexDirection: "row", alignItems: "center", gap: space[3] },
  views: { flexDirection: "row", gap: space[2] },
  view: {
    flex: 1,
    minHeight: size.target,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[2],
    borderRadius: size.radiusPrimary,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  viewOn: { backgroundColor: color.accent, borderColor: color.accent },
  list: { gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: size.primary,
    padding: space[3],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  jobHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  jobPerson: { flexDirection: "row", alignItems: "center", gap: space[2] },
  sheetStatus: { flexDirection: "row", alignItems: "center", gap: space[2] },
  choices: { gap: space[2] },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: size.target,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: size.radiusCard,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  chosen: { borderColor: color.accent, backgroundColor: color.accentTint },
  stepper: { gap: space[1] },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  step: {
    width: size.primary,
    height: size.target,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: size.radiusPrimary,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  time: { flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] },
});
