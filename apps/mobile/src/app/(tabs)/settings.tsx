// Me: the language, the person's own name and contact phone, the build they are on, and the
// way out. The name and the phone are the person's to write (`me.update`); the number they
// sign in with is the office's, and is not here. Saving needs a connection and says so when
// it has none. Signing out never discards an entry: what has not been sent stays in the
// outbox under its owner and goes when they sign in again, and the screen says so before
// the button.
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { createApi } from "../../api";
import { apiUrl, BUILD } from "../../config";
import { useStrings } from "../../i18n";
import { useReminders } from "../../reminders";
import { reportOnPurpose, reportsOnPurpose } from "../../report";
import { headersFor, useSession } from "../../session";
import { useSync } from "../../sync/provider";
import { color, size, space, type } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { SyncChip } from "../../ui/sync-chip";

export default function Me() {
  const { t, language, setLanguage } = useStrings();
  const { session, signOut } = useSession();
  const { snapshot, records, sync } = useSync();
  const router = useRouter();
  const api = useMemo(
    () => (apiUrl === null ? null : createApi(apiUrl, () => headersFor(session))),
    [session],
  );
  const pulledName = snapshot?.data.me.name ?? "";
  const [name, setName] = useState(pulledName);
  const [phone, setPhone] = useState("");
  // Until the server has answered with the phone it holds, saving would blank it.
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<"saved" | "failed" | null>(null);
  const reminders = useReminders();
  const [remindersRefused, setRemindersRefused] = useState(false);
  const [reported, setReported] = useState(false);

  // The name comes with the pull; the contact phone only from the server, when reachable.
  useEffect(() => {
    setName((typed) => (typed === "" ? pulledName : typed));
  }, [pulledName]);
  useEffect(() => {
    if (api === null) return;
    let live = true;
    api.me.get.query().then(
      (me) => {
        if (!live) return;
        setName(me.name);
        setPhone(me.phone ?? "");
        setLoaded(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);

  const save = async () => {
    if (api === null || !loaded || name.trim() === "") return;
    // The number pad has no key that closes it, and it covers the answer and the tabs.
    Keyboard.dismiss();
    setBusy(true);
    setNote(null);
    try {
      const saved = await api.me.update.mutate({
        name,
        phone: phone === "" ? null : phone,
      });
      setName(saved.name);
      setPhone(saved.phone ?? "");
      setNote("saved");
      // The pull carries the name to the rest of the app.
      void sync();
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
    }
  };

  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;
  return (
    <Screen testID="settings">
      <View style={styles.head}>
        <Text style={text.title}>{t.settings.title}</Text>
        <SyncChip />
      </View>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The page scrolls clear of the keyboard, so Save is never under it.
        automaticallyAdjustKeyboardInsets
      >
        <Text style={text.label}>{t.settings.language}</Text>
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Button
              testID="language-en"
              kind={language === "en" ? "primary" : "secondary"}
              label={t.settings.english}
              onPress={() => setLanguage("en")}
            />
          </View>
          <View style={styles.fill}>
            <Button
              testID="language-es"
              kind={language === "es" ? "primary" : "secondary"}
              label={t.settings.spanish}
              onPress={() => setLanguage("es")}
            />
          </View>
        </View>

        <Text style={text.label}>{t.settings.name}</Text>
        <TextInput
          testID="settings-name"
          accessibilityLabel={t.settings.name}
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={120}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
        <Text style={text.label}>{t.settings.phone}</Text>
        <TextInput
          testID="settings-phone"
          accessibilityLabel={t.settings.phone}
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          maxLength={32}
          editable={loaded}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <Text style={text.secondary}>{t.settings.phoneHelp}</Text>
        <Button
          testID="settings-save"
          label={busy ? t.loading : t.settings.save}
          disabled={busy || !loaded || name.trim() === ""}
          onPress={() => void save()}
        />
        {note !== null && (
          <Text
            testID={`settings-${note}`}
            accessibilityLiveRegion="polite"
            style={
              note === "saved"
                ? [text.secondary, { color: color.doneInk }]
                : text.attention
            }
          >
            {note === "saved" ? t.settings.saved : t.settings.saveFailed}
          </Text>
        )}

        <Text style={text.label}>{t.reminders.label}</Text>
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Button
              testID="reminders-on"
              kind={reminders.setting === "on" ? "primary" : "secondary"}
              label={t.reminders.on}
              onPress={() =>
                void reminders.turnOn().then((granted) => setRemindersRefused(!granted))
              }
            />
          </View>
          <View style={styles.fill}>
            <Button
              testID="reminders-off"
              kind={reminders.setting === "on" ? "secondary" : "primary"}
              label={t.reminders.off}
              onPress={() => {
                setRemindersRefused(false);
                void reminders.turnOff();
              }}
            />
          </View>
        </View>
        {remindersRefused && (
          <Text testID="reminders-refused" style={text.attention}>
            {t.reminders.refused}
          </Text>
        )}

        {unsent > 0 && (
          <Text testID="sign-out-unsent" style={text.attention}>
            {t.settings.unsentKept(unsent)}
          </Text>
        )}
        <Button
          testID="sign-out"
          kind="secondary"
          label={t.settings.signOut}
          onPress={() => {
            void signOut().then(() => router.replace("/sign-in"));
          }}
        />
        {/* In a staging build a long press sends one report on purpose (report.ts). */}
        <Text
          testID="settings-build"
          style={[text.secondary, styles.build]}
          onLongPress={
            reportsOnPurpose
              ? () => {
                  reportOnPurpose();
                  setReported(true);
                }
              : undefined
          }
        >
          {t.settings.build(String(BUILD))}
        </Text>
        {reported && (
          <Text testID="settings-reported" style={[text.secondary, styles.build]}>
            {t.settings.testReportSent}
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: space[2] },
  page: { gap: space[3], paddingBottom: space[6] },
  pair: { flexDirection: "row", gap: space[2] },
  input: {
    minHeight: size.target,
    paddingHorizontal: space[3],
    borderRadius: size.radiusCard,
    borderWidth: 1,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    color: color.ink,
    fontSize: type.body.fontSize,
  },
  build: { textAlign: "center" },
});
