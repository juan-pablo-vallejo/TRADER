// The sign-in screen, on D'Sierra's brand as the office's is: a navy band with the mark, the
// heading in Bodoni Moda, one red button. One field takes a mobile number or an email, then
// the code sent to it; another code after half a minute; "Trouble signing in?" on every
// step; and the Demo door. The steps are sign-in-steps.ts, over the provider it is handed
// (sign-in-provider.ts): Clerk's, or the development stand-in. Nobody signs up here: an
// address no roster holds is told to ask the office, by the provider before a code is sent
// or by the server after it.
import { BodoniModa_700Bold, useFonts } from "@expo-google-fonts/bodoni-moda";
import { SIGN_IN_CODE_LENGTH, type SignInIdentifier } from "@trader/api/contract";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createApi } from "../api";
import { useStrings } from "../i18n";
import type { Catalog } from "../i18n/catalog";
import { headersFor, useSession } from "../session";
import {
  demoDoor,
  FIELD,
  resend,
  secondsLeft,
  sendCode,
  verifyCode,
  type Form,
  type Note,
  type Provider,
  type Step,
} from "../sign-in-steps";
import { color, size, space, type } from "../theme";
import { Button, text } from "./controls";
import { Mark } from "./mark";

// What the form says for each refusal, in the screen's language.
export function sentence(s: Catalog["signIn"], note: Note): string {
  return {
    unknown: s.notOnRoster,
    wrong_code: s.codeWrong,
    expired_code: s.codeExpired,
    too_many: s.tooMany,
    locked: s.locked,
    failed: s.failed,
    bad_address: s.badAddress,
    bad_demo: s.badDemo,
  }[note];
}

// A sign-in number as people read it: (401) 555-0108.
const shown = (e164: string) =>
  `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;

export function PhoneSignIn({
  apiUrl,
  provider,
  standIn = false,
}: {
  apiUrl: string;
  provider: Provider;
  // The development stand-in is the provider: said on the screen, with its code.
  standIn?: boolean;
}) {
  const { t } = useStrings();
  const s = t.signIn;
  const { signIn: keep } = useSession();
  const router = useRouter();
  // Until the heading's face has loaded, the system's serif stands in: nothing waits on it.
  const [fontLoaded] = useFonts({ BodoniModa_700Bold });
  const [form, setForm] = useState<Form>(FIELD);
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [demoPhone, setDemoPhone] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [trouble, setTrouble] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The resend countdown ticks only while there is one to show.
  const waiting = form.at === "code" ? secondsLeft(form.sentAt, now) : 0;
  useEffect(() => {
    if (waiting <= 0) return;
    const tick = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(tick);
  }, [waiting, now]);

  // One step at a time: busy while it runs, and whatever it threw said as a failure.
  const run = async (
    step: () => Promise<Step | "complete" | "incomplete">,
    to?: SignInIdentifier,
  ) => {
    setBusy(true);
    setNote(null);
    try {
      const done = await step();
      if (done === "incomplete") return;
      if (done === "complete") {
        await enter(to ?? null);
        return;
      }
      // A refused code is cleared, and so is any code when the step changes.
      if (done.form.at !== form.at || done.note !== null) setCode("");
      setForm(done.form);
      setNote(done.note);
      setNow(Date.now());
    } catch {
      setNote("failed");
    } finally {
      setBusy(false);
    }
  };

  // The provider has a verified sign-in: make it the phone's session, and ask the server
  // whether a roster holds this person, which is the server's to say.
  const enter = async (to: SignInIdentifier | null) => {
    const session = await provider.finish(to);
    try {
      await createApi(apiUrl, () => headersFor(session)).me.get.query();
    } catch (error) {
      const refused =
        (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";
      if (refused) {
        await provider.forgetStale();
        setForm(FIELD);
      }
      setNote(refused ? "unknown" : "failed");
      return;
    }
    await keep(session);
    router.replace("/today");
  };

  // The keyboard goes as the code is asked for, so the answer under the button is seen.
  const send = () => {
    Keyboard.dismiss();
    void run(() => sendCode(provider, typed, Date.now()));
  };
  const check = (entered: string) => {
    if (form.at !== "code") return;
    void run(() => verifyCode(provider, form, entered), form.to);
  };
  const demo = () =>
    void run(() =>
      demoDoor(
        provider,
        async (phone, given) => {
          const answer = await createApi(apiUrl, async () => ({})).demo.signIn.mutate({
            phone,
            code: given,
          });
          return answer.result === "ticket" ? { ticket: answer.ticket } : null;
        },
        demoPhone,
        demoCode,
      ),
    );
  const back = () => {
    setForm(FIELD);
    setNote(null);
    setCode("");
    setDemoCode("");
  };

  const heading = [styles.heading, fontLoaded && styles.bodoni];

  return (
    <SafeAreaView testID="sign-in" style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <View style={styles.band}>
        <Mark />
      </View>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // Dragged away, the keyboard shows what is under it: the trouble lines.
        keyboardDismissMode="on-drag"
      >
        {form.at === "field" && (
          <>
            <Text style={heading} accessibilityRole="header">
              {s.title}
            </Text>
            <Text style={text.body}>{s.helper}</Text>
            <Text style={text.label}>{s.address}</Text>
            <TextInput
              testID="sign-in-address"
              accessibilityLabel={s.address}
              style={styles.input}
              autoFocus
              value={typed}
              onChangeText={setTyped}
              // Letters, digits and an @: a number and an email are both typed here.
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              autoComplete="username"
              maxLength={254}
              returnKeyType="go"
              onSubmitEditing={send}
            />
            <Button
              testID="sign-in-send"
              kind="brand"
              label={busy ? s.sending : s.send}
              disabled={busy}
              onPress={send}
            />
          </>
        )}
        {form.at === "code" && (
          <>
            <Text style={heading} accessibilityRole="header">
              {s.codeTitle}
            </Text>
            <Text style={text.body}>
              {form.to.kind === "phone"
                ? s.codeTexted(shown(form.to.phone))
                : s.codeEmailed(form.to.email)}
            </Text>
            <Text style={text.label}>{s.code}</Text>
            <TextInput
              testID="sign-in-code"
              accessibilityLabel={s.code}
              // The texted code is offered above the keyboard, and one tap fills it: iOS by
              // `oneTimeCode`, Android by `sms-otp`.
              style={[styles.input, styles.code]}
              autoFocus
              maxLength={SIGN_IN_CODE_LENGTH}
              value={code}
              editable={!busy}
              onChangeText={(entered) => {
                const digits = entered.replace(/\D/g, "").slice(0, SIGN_IN_CODE_LENGTH);
                setCode(digits);
                // The last digit sends it: nobody types a code and then looks for a button.
                if (digits.length === SIGN_IN_CODE_LENGTH) check(digits);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              returnKeyType="go"
              onSubmitEditing={() => check(code)}
            />
            <Button
              testID="sign-in-verify"
              kind="brand"
              label={busy ? s.checking : s.submit}
              disabled={busy || code.length < SIGN_IN_CODE_LENGTH}
              onPress={() => check(code)}
            />
            <TextButton
              testID="sign-in-resend"
              label={waiting > 0 ? s.resendIn(waiting) : s.resend}
              disabled={busy || waiting > 0}
              onPress={() => {
                if (form.at === "code")
                  void run(() => resend(provider, form, Date.now()));
              }}
            />
            <TextButton
              testID="sign-in-change"
              label={s.change}
              disabled={busy}
              onPress={back}
            />
          </>
        )}
        {form.at === "demo" && (
          <>
            <Text style={heading} accessibilityRole="header">
              {s.demo}
            </Text>
            <Text style={text.body}>{s.demoHelp}</Text>
            <Text style={text.label}>{s.demoPhone}</Text>
            <TextInput
              testID="sign-in-demo-phone"
              accessibilityLabel={s.demoPhone}
              style={styles.input}
              value={demoPhone}
              onChangeText={setDemoPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
            />
            <Text style={text.label}>{s.demoCode}</Text>
            <TextInput
              testID="sign-in-demo-code"
              accessibilityLabel={s.demoCode}
              style={styles.input}
              value={demoCode}
              onChangeText={setDemoCode}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={demo}
            />
            <Button
              testID="sign-in-demo-submit"
              kind="brand"
              label={busy ? s.checking : s.demoSubmit}
              disabled={busy}
              onPress={demo}
            />
            <TextButton
              testID="sign-in-demo-back"
              label={s.back}
              disabled={busy}
              onPress={back}
            />
          </>
        )}
        {note !== null && (
          <Text testID="sign-in-note" style={text.attention} accessibilityRole="alert">
            {sentence(s, note)}
          </Text>
        )}
        {form.at === "field" && (
          <TextButton
            testID="sign-in-demo"
            label={s.demo}
            disabled={busy}
            onPress={() => {
              setNote(null);
              setForm({ at: "demo" });
            }}
          />
        )}
        <TextButton
          testID="sign-in-trouble"
          label={s.trouble}
          disabled={false}
          expanded={trouble}
          onPress={() => setTrouble(!trouble)}
        />
        {trouble && (
          <View testID="sign-in-trouble-help" style={styles.trouble}>
            <Text style={text.secondary}>{s.troubleNoCode}</Text>
            <Text style={text.secondary}>{s.troubleNewPhone}</Text>
            <Text style={text.secondary}>{s.troubleNeverInvited}</Text>
          </View>
        )}
        {standIn && (
          <Text testID="sign-in-stand-in" style={text.secondary}>
            {s.developmentOnly}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// What else can be done on a step: a button that reads as a link, 48 pt tall.
function TextButton({
  testID,
  label,
  disabled,
  onPress,
  expanded,
}: {
  testID: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  expanded?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(expanded !== undefined && { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={styles.textButton}
    >
      <Text style={[styles.textButtonLabel, disabled && styles.textButtonDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The navy runs up under the clock; the page below it is the app's own.
  screen: { flex: 1, backgroundColor: color.brandNavy },
  band: { alignItems: "center", paddingVertical: space[6] },
  page: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space[4], gap: space[4], paddingBottom: space[6] * 2 },
  heading: {
    ...(type.title as TextStyle),
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    color: color.brandNavy,
  },
  // Bodoni Moda draws its own weight: a weight asked of it as well would be faked.
  bodoni: { fontFamily: "BodoniModa_700Bold", fontWeight: "normal" },
  input: {
    minHeight: 64,
    paddingHorizontal: space[3],
    borderRadius: size.radiusCard,
    borderWidth: 1,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    color: color.ink,
    fontSize: 22,
  },
  code: { letterSpacing: 6, textAlign: "center", fontVariant: ["tabular-nums"] },
  textButton: {
    minHeight: size.target,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  textButtonLabel: {
    ...(type.bodyStrong as TextStyle),
    color: color.accent,
    textDecorationLine: "underline",
  },
  textButtonDisabled: { color: color.muted, textDecorationLine: "none" },
  trouble: { gap: space[2] },
});
