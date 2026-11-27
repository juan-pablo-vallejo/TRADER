// An admin's Today: no clock-in, but what needs attention, as the office's Today shows it.
// Needs attention (sessions left open from an earlier day, people late for a shift, each by
// the shared rule, contract/crew.ts), who is on the clock now, who is expected, and money.
// It reads `overview.today`, the answer Crew reads, again each cycle while it is in front.
// A late person has WhatsApp beside them; a session left open is corrected in the office.
import { attention, crewStatus, wallClock, whatsAppLink } from "@trader/api/contract";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";

import { createApi } from "../api";
import { apiUrl } from "../config";
import { dayName, money, timeOfDay, wallTime } from "../format";
import { useStrings } from "../i18n";
import { headersFor, useSession } from "../session";
import type { Crew } from "../sync/crew";
import { CYCLE_MS } from "../sync/clock";
import { useSync } from "../sync/provider";
import { color, size, space } from "../theme";
import { Screen, text } from "./controls";
import { Band } from "./band";
import { SyncChip } from "./sync-chip";
import { Text } from "./text";
import { WhatsAppButton } from "./whatsapp-button";

type Load = { phase: "loading" } | { phase: "offline" } | { phase: "ready"; today: Crew };

export function AdminToday() {
  const { t, language } = useStrings();
  const a = t.adminToday;
  const { session } = useSession();
  const { snapshot } = useSync();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const api = useMemo(
    () => (apiUrl === null ? null : createApi(apiUrl, () => headersFor(session))),
    [session],
  );
  // The newest request's answer is the one shown: an older one that lands late is dropped.
  const asked = useRef(0);
  const refresh = useCallback(async () => {
    if (api === null) return setLoad({ phase: "offline" });
    const mine = ++asked.current;
    try {
      const today = await api.overview.today.query();
      if (mine === asked.current) setLoad({ phase: "ready", today });
    } catch {
      if (mine === asked.current) setLoad({ phase: "offline" });
    }
  }, [api]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), CYCLE_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const today = load.phase === "ready" ? load.today : null;
  const zone = today?.timezone ?? snapshot?.data.company.timezone ?? "UTC";
  const minute = wallClock(new Date(), zone).minute;
  const jobName = new Map<string, string>([
    ...(snapshot?.data.jobs ?? []).map((j) => [j.id, j.name] as const),
    ...(today?.jobs ?? []).map((j) => [j.id, j.name] as const),
  ]);
  const nameOf = (id: string) => jobName.get(id) ?? "";
  const rows = today === null ? [] : attention(today, minute);
  const working =
    today?.people.filter((p) => ["working", "break"].includes(crewStatus(p, minute))) ??
    [];
  const expected =
    today?.people.filter((p) => crewStatus(p, minute) === "expected") ?? [];

  return (
    <Screen
      testID="admin-today"
      band={<Band title={t.today.title} beside={<SyncChip />} />}
    >
      <ScrollView contentContainerStyle={styles.page}>
        {load.phase === "offline" && (
          <Text testID="admin-today-offline" style={text.attention}>
            {a.offline}
          </Text>
        )}
        {today !== null && (
          <>
            <Text style={text.label} accessibilityRole="header">
              {a.attention}
            </Text>
            {rows.length === 0 ? (
              <Text testID="attention-clear" style={text.body}>
                {a.attentionClear}
              </Text>
            ) : (
              <View testID="attention-list" style={styles.list}>
                {rows.map((row) => {
                  const chat =
                    row.kind === "late" ? whatsAppLink(row.person.phone) : null;
                  return (
                    <View key={row.key} style={styles.row}>
                      <Text style={text.body}>
                        {row.kind === "open"
                          ? a.stillOpen(
                              row.person.name,
                              nameOf(row.jobId),
                              dayName(row.sinceDay, language),
                            )
                          : a.late(
                              row.person.name,
                              nameOf(row.jobId),
                              wallTime(row.start, language),
                            )}
                      </Text>
                      {row.kind === "open" ? (
                        <Text style={text.secondary}>{a.fixInOffice}</Text>
                      ) : chat === null ? (
                        <Text style={text.secondary}>{a.noNumber}</Text>
                      ) : (
                        <WhatsAppButton
                          testID={`attention-whatsapp-${row.person.id}`}
                          spoken={t.crew.person.whatsAppSpoken(row.person.name)}
                          onPress={() =>
                            void Linking.openURL(chat).catch(() => undefined)
                          }
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={text.label} accessibilityRole="header">
              {a.onTheClock}
            </Text>
            {working.length === 0 ? (
              <Text style={text.body}>{a.nobodyWorking}</Text>
            ) : (
              <View style={styles.list}>
                {working.map((p) => (
                  <View key={p.person.id} style={styles.row}>
                    <Text style={text.bodyStrong}>{p.person.name}</Text>
                    {p.clock.status !== "off" && (
                      <Text style={text.secondary}>
                        {(p.clock.status === "paused" ? a.onBreakAt : a.at)(
                          nameOf(p.clock.jobId),
                          timeOfDay(p.clock.since, zone, language),
                        )}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {expected.length > 0 && (
              <>
                <Text style={text.label} accessibilityRole="header">
                  {a.expected}
                </Text>
                <View style={styles.list}>
                  {expected.map((p) => {
                    const next = p.shifts.find((s) => !s.clockedIn);
                    return (
                      <View key={p.person.id} style={styles.row}>
                        <Text style={text.bodyStrong}>{p.person.name}</Text>
                        {next !== undefined && (
                          <Text style={text.secondary}>
                            {a.expectedAt(
                              nameOf(next.jobId),
                              wallTime(next.start, language),
                            )}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={text.label} accessibilityRole="header">
              {a.money}
            </Text>
            <View style={styles.list}>
              <View style={styles.row}>
                {today.money.owed.length === 0 ? (
                  <Text style={text.body}>{a.nothingOwed}</Text>
                ) : (
                  today.money.owed.map((o) => (
                    <Text key={o.currency} style={text.bodyStrong}>
                      {a.owed(money(o.cents, o.currency, language), o.invoices)}
                    </Text>
                  ))
                )}
                {today.money.overdue.map((o) => (
                  <Text key={o.currency} style={text.attention}>
                    {a.overdue(money(o.cents, o.currency, language))}
                  </Text>
                ))}
              </View>
              <View style={styles.row}>
                <Text style={text.body}>{a.drafts(today.money.drafts)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={text.body}>
                  {a.notInvoiced(today.money.completeJobsNotInvoiced)}
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: space[3], paddingBottom: space[6] },
  list: { gap: space[2] },
  row: {
    gap: space[1],
    minHeight: size.target,
    justifyContent: "center",
    padding: space[3],
    borderRadius: size.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
});
