// Me: the language, the person's name and sign-in addresses, Face ID or fingerprint sign-in
// on this phone, the build they are on, and the way out. A worker's name and addresses are
// the office's, shown greyed; an admin writes their own name (`me.update`). A person whose
// login has no email may add one, proved by a code mailed to it (ui/add-email.tsx). The contact phone comes from the server alone: asked as Me comes into focus and as
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type TextStyle,
  View,
} from "react-native";

import { createApi } from "../../api";
import { keySwitch } from "../../biometric-rules";
import { KEY_FOR, KEY_MADE_AT, useBiometrics } from "../../biometrics";
import { apiUrl, BUILD } from "../../config";
import { announce, felt } from "../../feedback";
import { useSpeech, useStrings } from "../../i18n";
import { contactLoader, mePairs, signInRows, type SignInRow } from "../../me";
import { useReminders } from "../../reminders";
import { reportOnPurpose, reportsOnPurpose } from "../../report";
import { headersFor, useSession } from "../../session";
import { deviceStore } from "../../store/device";
import { useSync } from "../../sync/provider";
import { border, color, grows, size, space, type } from "../../theme";
import { Band } from "../../ui/band";
import { Button, Pair, Screen, Side, text } from "../../ui/controls";
import { AddEmail } from "../../ui/add-email";
import { SyncChip } from "../../ui/sync-chip";
import { Field } from "../../ui/field";
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
  // The addresses this person signs in with: shown, never edited here.
  const [signIn, setSignIn] = useState<SignInRow[]>([]);
  // Until the server has answered with the phone it holds, saving would blank it.
  const [contact, setContact] = useState<"loading" | "failed" | "loaded">("loading");
  const loaded = contact === "loaded";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<"saved" | "failed" | null>(null);
  const reminders = useReminders();
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
                setSignIn(signInRows(state.contact));
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
    Keyboard.dismiss();
    setBusy(true);
    setNote(null);
    try {
      // The contact phone is no longer edited here: what the server holds goes back as it is.
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

  // A worker's name is the office's, as both addresses are: greyed, and no Save.
  const admin = snapshot?.data.me.role === "admin";
  const hasEmail = signIn.some((row) => row.kind === "email");
  const pairs = mePairs({ language, key });
  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;
  return (
    <Screen
      testID="me"
      band={
        <Band title={t.me.title} beside={<SyncChip />}>
          {name.trim() !== "" && (
            <Text style={styles.heroName} maxFontSizeMultiplier={grows.display}>
              {name}
            </Text>
          )}
        </Band>
      }
    >
      {/* The page scrolls clear of the keyboard, so Save is never under it: on iOS by the
          scroll view's own insets; on Android, where that prop does nothing, by padding the
          keyboard's height under the page. */}
      <KeyboardAvoidingView
        style={styles.room}
        behavior={Platform.OS === "android" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={text.label}>{t.me.language}</Text>
          <Pair>
            {pairs.language.map(({ value, selected }) => (
              <Side key={value}>
                <Button
                  testID={`language-${value}`}
                  kind={selected ? "primary" : "secondary"}
                  selected={selected}
                  label={value === "en" ? t.me.english : t.me.spanish}
                  onPress={() => setLanguage(value)}
                />
              </Side>
            ))}
          </Pair>

          <Text style={text.label}>{t.me.name}</Text>
          {admin ? (
            <Field
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
          ) : (
            <>
              <Field
                testID="me-name"
                accessibilityLabel={t.me.name}
                accessibilityLanguage={speech}
                accessibilityState={{ disabled: true }}
                style={[styles.input, styles.readOnly]}
                value={name}
                editable={false}
                // Read, not typed: the whole value wraps, never cut short at a large text size.
                multiline
                selectTextOnFocus={false}
              />
              <Text style={text.secondary}>{t.me.nameByOffice}</Text>
            </>
          )}
          {signIn.map((row) => (
            <View key={row.kind} style={styles.field}>
              <Text style={text.label}>
                {row.kind === "phone" ? t.me.signInPhone : t.me.signInEmail}
              </Text>
              {/* Read-only: greyed, and said as not editable. Only the office (or TRADER's
                  support, for an admin) changes how a person signs in. */}
              <Field
                testID={`me-sign-in-${row.kind}`}
                accessibilityLabel={
                  row.kind === "phone" ? t.me.signInPhone : t.me.signInEmail
                }
                accessibilityLanguage={speech}
                accessibilityState={{ disabled: true }}
                style={[styles.input, styles.readOnly]}
                value={row.value}
                editable={false}
                // Read, not typed: the whole value wraps, never cut short at a large text size.
                multiline
                selectTextOnFocus={false}
              />
              <Text style={text.secondary}>
                {row.changedBy === "office" ? t.me.signInByOffice : t.me.signInBySupport}
              </Text>
            </View>
          ))}
          {loaded && !hasEmail && api !== null && (
            <AddEmail
              api={api}
              // The loader asks only until its first answer: the added email is read here.
              onAdded={() =>
                void api.me.get
                  .query()
                  .then((contact) => setSignIn(signInRows(contact)))
                  .catch(() => setContact("failed"))
              }
            />
          )}
          {contact === "failed" && (
            <>
              <Text
                testID="me-not-loaded"
                accessibilityLiveRegion="polite"
                style={text.attention}
              >
                {t.me.notLoaded}
              </Text>
              <Button
                testID="me-retry"
                kind="secondary"
                label={t.retry}
                onPress={() => void loadContact()}
              />
            </>
          )}
          {admin && (
            <Button
              testID="me-save"
              label={busy ? t.loading : t.me.save}
              disabled={busy || !loaded || name.trim() === ""}
              onPress={() => void save()}
            />
          )}
          {note !== null && (
            <Text
              testID={`me-${note}`}
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

          {/* Shift reminders are always on; the phone's own refusal is the one way off. */}
          {reminders.refused && (
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
                  <Side key={value}>
                    <Button
                      testID={`biometric-me-${value}`}
                      kind={selected ? "primary" : "secondary"}
                      selected={selected}
                      label={value === "on" ? t.biometric.on : t.biometric.off}
                      disabled={keyBusy}
                      onPress={() => void setKeyOn(value === "on")}
                    />
                  </Side>
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
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1 },
  fill: { flex: 1 },
  page: { gap: space[3], paddingBottom: space[6] },
  input: {
    minHeight: size.target,
    paddingHorizontal: space[3],
    borderRadius: size.radiusCard,
    borderWidth: border.hairline,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    color: color.ink,
    fontSize: type.body.fontSize,
  },
  build: { textAlign: "center" },
  // The person's name, large on the navy band.
  heroName: { ...(type.display as TextStyle), color: color.onAction },
  field: { gap: space[3] },
  // Greyed, so it reads as locked: a grey fill, a hairline in place of a control's navy
  // edge, and the secondary ink (above 4.5:1 on the fill).
  readOnly: {
    backgroundColor: color.neutralTint,
    borderColor: color.border,
    color: color.inkSecondary,
  },
});
