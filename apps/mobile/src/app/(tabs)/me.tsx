// Me: the language, the person's own name and contact phone, Face ID or fingerprint sign-in
// on this phone, the build they are on, and the way out. The name and the phone are the person's to write (`me.update`); the number they
// sign in with is the office's, and is not here. Saving needs a connection and says so when
// it has none. Signing out never discards an entry: what has not been sent stays in the
// outbox under its owner and goes when they sign in again, and the screen says so before
// the button.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { createApi } from "../../api";
import { keySwitch } from "../../biometric-rules";
import { KEY_FOR, useBiometrics } from "../../biometrics";
import { apiUrl, BUILD } from "../../config";
import { useStrings } from "../../i18n";
import { useReminders } from "../../reminders";
import { reportOnPurpose, reportsOnPurpose } from "../../report";
import { headersFor, useSession } from "../../session";
import { deviceStore } from "../../store/device";
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
  // The phone's key: on for this person's, off for none or another's, absent where none can
  // be (biometric-rules.ts). Sign out leaves it where it is.
  const biometrics = useBiometrics();
  const who = snapshot?.data.me.id ?? null;
  const [key, setKey] = useState<"on" | "off" | "absent">("absent");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyFailed, setKeyFailed] = useState(false);
  const readKey = useCallback(async () => {
    if (who === null) return;
    setKey(
      keySwitch(await biometrics.availability(), await deviceStore.read(KEY_FOR), who),
    );
  }, [biometrics, who]);
  useEffect(() => {
    void readKey();
  }, [readKey]);
  const setKeyOn = async (on: boolean) => {
    if (who === null || session === null || session === undefined) return;
    // The side already chosen does nothing.
    if (on === (key === "on")) return;
    setKeyBusy(true);
    setKeyFailed(false);
    if (on) {
      const made = await biometrics.enroll(session, t.biometric.prompt);
      if (made) await deviceStore.write(KEY_FOR, who);
      else setKeyFailed(true);
    } else {
      await biometrics.revokeHere();
      await deviceStore.write(KEY_FOR, null);
    }
    await readKey();
    setKeyBusy(false);
  };

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
    <Screen testID="me">
      <View style={styles.head}>
        <Text style={text.title}>{t.me.title}</Text>
        <SyncChip />
      </View>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // The page scrolls clear of the keyboard, so Save is never under it.
        automaticallyAdjustKeyboardInsets
      >
        <Text style={text.label}>{t.me.language}</Text>
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Button
              testID="language-en"
              kind={language === "en" ? "primary" : "secondary"}
              label={t.me.english}
              onPress={() => setLanguage("en")}
            />
          </View>
          <View style={styles.fill}>
            <Button
              testID="language-es"
              kind={language === "es" ? "primary" : "secondary"}
              label={t.me.spanish}
              onPress={() => setLanguage("es")}
            />
          </View>
        </View>

        <Text style={text.label}>{t.me.name}</Text>
        <TextInput
          testID="me-name"
          accessibilityLabel={t.me.name}
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={120}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
        <Text style={text.label}>{t.me.phone}</Text>
        <TextInput
          testID="me-phone"
          accessibilityLabel={t.me.phone}
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          maxLength={32}
          editable={loaded}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <Text style={text.secondary}>{t.me.phoneHelp}</Text>
        <Button
          testID="me-save"
          label={busy ? t.loading : t.me.save}
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
            {note === "saved" ? t.me.saved : t.me.saveFailed}
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

        {key !== "absent" && (
          <>
            <Text style={text.label}>
              {t.biometric.meLabel(t.biometric.names[biometrics.name])}
            </Text>
            <View style={styles.pair}>
              <View style={styles.fill}>
                <Button
                  testID="biometric-me-on"
                  kind={key === "on" ? "primary" : "secondary"}
                  label={t.biometric.on}
                  disabled={keyBusy}
                  onPress={() => void setKeyOn(true)}
                />
              </View>
              <View style={styles.fill}>
                <Button
                  testID="biometric-me-off"
                  kind={key === "on" ? "secondary" : "primary"}
                  label={t.biometric.off}
                  disabled={keyBusy}
                  onPress={() => void setKeyOn(false)}
                />
              </View>
            </View>
            <Text style={text.secondary}>{t.biometric.meHelp}</Text>
            {keyFailed && (
              <Text testID="biometric-me-failed" style={text.attention}>
                {t.biometric.failed}
              </Text>
            )}
          </>
        )}

        {unsent > 0 && (
          <Text testID="sign-out-unsent" style={text.attention}>
            {t.me.unsentKept(unsent)}
          </Text>
        )}
        <Button
          testID="sign-out"
          kind="secondary"
          label={t.me.signOut}
          onPress={() => {
            void signOut().then(() => router.replace("/sign-in"));
          }}
        />
        {/* In a staging build a long press sends one report on purpose (report.ts). */}
        <Text
          testID="me-build"
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
          {t.me.build(String(BUILD))}
        </Text>
        {reported && (
          <Text testID="me-reported" style={[text.secondary, styles.build]}>
            {t.me.testReportSent}
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
