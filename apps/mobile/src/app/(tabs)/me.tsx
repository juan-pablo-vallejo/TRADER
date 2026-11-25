// Me: the language, the person's own name and contact phone, Face ID or fingerprint sign-in
// on this phone, the build they are on, and the way out. The name and the phone are the
// person's to write (`me.update`); the number they sign in with is the office's, and is not
// here. The contact phone comes from the server alone: asked as Me comes into focus and as
// the app comes back, until it has answered once (me.ts); not loaded, it says why and
// offers Try again. Saving needs a connection and says so when it has none. The three pairs
// are radio groups, each side's selected state said. A verdict is said aloud as it is
// shown (feedback.ts). Signing out never discards an entry: what has not been sent stays in
// the outbox under its owner and goes when they sign in again, and the screen says so
// before the button.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { createApi } from "../../api";
import { keySwitch } from "../../biometric-rules";
import { KEY_FOR, KEY_MADE_AT, useBiometrics } from "../../biometrics";
import { apiUrl, BUILD } from "../../config";
import { announce, felt } from "../../feedback";
import { useSpeech, useStrings } from "../../i18n";
import { contactLoader, mePairs } from "../../me";
import { useReminders } from "../../reminders";
import { reportOnPurpose, reportsOnPurpose } from "../../report";
import { headersFor, useSession } from "../../session";
import { deviceStore } from "../../store/device";
import { useSync } from "../../sync/provider";
import { color, size, space, type } from "../../theme";
import { Button, Pair, Screen, text } from "../../ui/controls";
import { SyncChip } from "../../ui/sync-chip";
import { Text } from "../../ui/text";

export default function Me() {
  const { t, language, setLanguage } = useStrings();
  const speech = useSpeech();
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
  const [contact, setContact] = useState<"loading" | "failed" | "loaded">("loading");
  const loaded = contact === "loaded";
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
      if (made) {
        await deviceStore.write(KEY_FOR, who);
        await deviceStore.write(KEY_MADE_AT, new Date().toISOString());
      } else {
        setKeyFailed(true);
        felt("error");
        announce(t.biometric.failed);
      }
    } else {
      await biometrics.revokeHere();
      await deviceStore.write(KEY_FOR, null);
      await deviceStore.write(KEY_MADE_AT, null);
    }
    await readKey();
    setKeyBusy(false);
  };

  // The name comes with the pull; the contact phone only from the server, when reachable.
  useEffect(() => {
    setName((typed) => (typed === "" ? pulledName : typed));
  }, [pulledName]);
  const loadContact = useMemo(
    () =>
      api === null
        ? async () => setContact("failed")
        : contactLoader(
            () => api.me.get.query(),
            (state) => {
              setContact(state.phase);
              if (state.phase === "loaded") {
                setName(state.contact.name);
                setPhone(state.contact.phone ?? "");
              }
            },
          ),
    [api],
  );
  // Asked as Me comes into focus and as the app comes back to the front.
  useFocusEffect(
    useCallback(() => {
      void loadContact();
      const forward = AppState.addEventListener("change", (state) => {
        if (state === "active") void loadContact();
      });
      return () => forward.remove();
    }, [loadContact]),
  );

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
      felt("success");
      announce(t.me.saved);
      // The pull carries the name to the rest of the app.
      void sync();
    } catch {
      setNote("failed");
      felt("error");
      announce(t.me.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const pairs = mePairs({ language, reminders: reminders.setting, key });
  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;
  return (
    <Screen testID="me">
      <View style={styles.head}>
        <Text style={text.title} accessibilityRole="header">
          {t.me.title}
        </Text>
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
        <Pair>
          {pairs.language.map(({ value, selected }) => (
            <View key={value} style={styles.fill}>
              <Button
                testID={`language-${value}`}
                kind={selected ? "primary" : "secondary"}
                selected={selected}
                label={value === "en" ? t.me.english : t.me.spanish}
                onPress={() => setLanguage(value)}
              />
            </View>
          ))}
        </Pair>

        <Text style={text.label}>{t.me.name}</Text>
        <TextInput
          testID="me-name"
          accessibilityLabel={t.me.name}
          accessibilityLanguage={speech}
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
          accessibilityLanguage={speech}
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
        {contact === "failed" && (
          <>
            <Text
              testID="me-phone-not-loaded"
              accessibilityLiveRegion="polite"
              style={text.attention}
            >
              {t.me.phoneNotLoaded}
            </Text>
            <Button
              testID="me-phone-retry"
              kind="secondary"
              label={t.retry}
              onPress={() => void loadContact()}
            />
          </>
        )}
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
        <Pair>
          {pairs.reminders.map(({ value, selected }) => (
            <View key={value} style={styles.fill}>
              <Button
                testID={`reminders-${value}`}
                kind={selected ? "primary" : "secondary"}
                selected={selected}
                label={value === "on" ? t.reminders.on : t.reminders.off}
                onPress={() => {
                  if (value === "on") {
                    void reminders.turnOn().then((granted) => {
                      setRemindersRefused(!granted);
                      if (!granted) {
                        felt("error");
                        announce(t.reminders.refused);
                      }
                    });
                  } else {
                    setRemindersRefused(false);
                    void reminders.turnOff();
                  }
                }}
              />
            </View>
          ))}
        </Pair>
        {remindersRefused && (
          <Text testID="reminders-refused" style={text.attention}>
            {t.reminders.refused}
          </Text>
        )}

        {pairs.key !== null && (
          <>
            <Text style={text.label}>
              {t.biometric.meLabel(t.biometric.names[biometrics.name])}
            </Text>
            <Pair>
              {pairs.key.map(({ value, selected }) => (
                <View key={value} style={styles.fill}>
                  <Button
                    testID={`biometric-me-${value}`}
                    kind={selected ? "primary" : "secondary"}
                    selected={selected}
                    label={value === "on" ? t.biometric.on : t.biometric.off}
                    disabled={keyBusy}
                    onPress={() => void setKeyOn(value === "on")}
                  />
                </View>
              ))}
            </Pair>
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
