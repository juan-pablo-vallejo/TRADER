// The sign-in screen, on D'Sierra's brand as the office's is: a navy band with the mark, the
// heading in Bodoni Moda, one red button. One field takes a mobile number or an email, then
// the code sent to it; another code after half a minute; "Trouble signing in?" on every
// step; and the Demo door. Above the field: Face ID or fingerprint where this phone holds a
// key, Google, and Apple's own button on an iPhone: Apple's App Review rule 4.8 asks an app
// that offers Google's sign-in to offer Apple's too. The steps are sign-in-steps.ts, over
// the provider it is handed (sign-in-provider.ts): Clerk's, or the development stand-in.
// Nobody signs up here: an address or an account no company has added is told to ask the office,
// by the provider or by the server. After a sign-in by code, a phone that can is offered a
// key (biometric-rules.ts, app/biometric-offer.tsx). Clerk's prebuilt native screens are
// not used: they are in beta, and their language would not follow the app's own choice. A
// refusal is shown under its field and said aloud (feedback.ts); after a wrong code the
// keyboard stays and the field keeps its focus.
//
// Google's button carries Google's "G" in its standard colors on white, at the size of
// Google's own assets: "The button must always include the standard color for the Google
// "G"", and the rules are for "your website or app", with a padding for iOS and one for
// Android (Google's page, read 2026-11-25). The page is
// https://developers.google.com/identity/branding-guidelines, and the mark is cut from its
// download bundle (assets/google).
import { BodoniModa_700Bold, useFonts } from "@expo-google-fonts/bodoni-moda";
import { SIGN_IN_CODE_LENGTH, type SignInIdentifier } from "@trader/api/contract";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createApi } from "../api";
import {
  offersBiometric,
  offersKeySignIn,
  keyCheck,
  revokesKey,
  type SignedInBy,
} from "../biometric-rules";
import { DECLINED_BY, KEY_FOR, KEY_MADE_AT, useBiometrics } from "../biometrics";
import { announce, felt } from "../feedback";
import { useSpeech, useStrings } from "../i18n";
import type { Catalog } from "../i18n/catalog";
import { headersFor, useSession, type Session } from "../session";
import {
  demoDoor,
  FIELD,
  keepsKeyboard,
  resend,
  secondsLeft,
  sendCode,
  socialSignIn,
  verifyCode,
  type Form,
  type Note,
  type Provider,
  type Social,
  type Step,
} from "../sign-in-steps";
import { deviceStore } from "../store/device";
import { color, size, space, type } from "../theme";
import { Button, text } from "./controls";
import { Mark } from "./mark";
import { Text } from "./text";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- React Native's way to name a bundled image
const googleG = require("../../assets/google/g.png") as number;

// The heading's hyphen does not break: "Team sign-in" wraps between its words, never
// inside one.
const unbroken = (heading: string) => heading.replace(/-/g, "\u2011");
// How far the 32 pt heading grows with the phone's text size: at the largest, a word still
// fits the line.
const HEADING_GROWS = 1.5;

// What the form says for each refusal, in the screen's language.
export function sentence(s: Catalog["signIn"], note: Note): string {
  return {
    unknown: s.notAdded,
    apple_unknown: s.notAddedApple,
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
  const speech = useSpeech();
  const s = t.signIn;
  const codeField = useRef<ComponentRef<typeof TextInput>>(null);
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
  const biometrics = useBiometrics();
  // Whether this phone holds a key that signs someone in: asked once, as the screen opens.
  const [keyReady, setKeyReady] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const reason = await biometrics.availability();
      const keyFor = await deviceStore.read(KEY_FOR);
      if (live) setKeyReady(offersKeySignIn(reason, keyFor));
    })();
    return () => {
      live = false;
    };
  }, [biometrics]);

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
    to: SignInIdentifier | null = null,
    by: SignedInBy = "code",
  ) => {
    setBusy(true);
    setNote(null);
    try {
      const done = await step();
      if (done === "incomplete") return;
      if (done === "complete") {
        await admit(await provider.finish(to), by);
        return;
      }
      // A refused code is cleared, and so is any code when the step changes.
      if (done.form.at !== form.at || done.note !== null) setCode("");
      setForm(done.form);
      setNote(done.note);
      if (done.note !== null) {
        felt("error");
        announce(sentence(s, done.note));
        // Where typing again helps, a wrong code above all, the field keeps the keyboard;
        // where it cannot, the keyboard goes (sign-in-steps.ts, keepsKeyboard).
        if (keepsKeyboard(done.note)) codeField.current?.focus();
        else Keyboard.dismiss();
      }
      setNow(Date.now());
    } catch {
      setNote("failed");
      felt("error");
      announce(s.failed);
    } finally {
      setBusy(false);
    }
  };

  // Every way in ends here. The provider has a session: ask the server whether a company
  // has added this person, which is the server's to say. Refused after a sign-in by the key
  // (deactivated, no longer added by a company, or the address changed since the key was
  // made), the key goes too. Admitted after a code, a phone that can is offered a key;
  // everyone else goes to Today.
  const admit = async (session: Session, by: SignedInBy) => {
    let who: string;
    try {
      const check = keyCheck(by, await deviceStore.read(KEY_MADE_AT));
      who = (await createApi(apiUrl, () => headersFor(session)).me.get.query(check)).id;
    } catch (error) {
      const refused =
        (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";
      if (refused) {
        if (revokesKey(by)) {
          await biometrics.revokeHere();
          await deviceStore.write(KEY_FOR, null);
          await deviceStore.write(KEY_MADE_AT, null);
          setKeyReady(false);
        }
        await provider.forgetStale();
        setForm(FIELD);
      }
      setNote(refused ? "unknown" : "failed");
      felt("error");
      announce(refused ? s.notAdded : s.failed);
      return;
    }
    await keep(session);
    if (by === "code") {
      const offered = offersBiometric({
        by,
        reason: await biometrics.availability(),
        keyFor: await deviceStore.read(KEY_FOR),
        declinedBy: await deviceStore.read(DECLINED_BY),
        who,
      });
      if (offered) {
        router.replace({ pathname: "/biometric-offer", params: { who } });
        return;
      }
    }
    router.replace("/today");
  };

  // Google or Apple: a session from the provider's own sheet, or why not.
  const withSocial = async (kind: Social) => {
    setBusy(true);
    setNote(null);
    try {
      const done = await socialSignIn(provider, kind, typed);
      if ("session" in done) await admit(done.session, kind);
      else {
        setNote(done.note);
        // A sheet the person closed says nothing.
        if (done.note !== null) {
          felt("error");
          announce(sentence(s, done.note));
        }
      }
    } catch {
      setNote("failed");
      felt("error");
      announce(s.failed);
    } finally {
      setBusy(false);
    }
  };

  // The phone's own lock. A sheet the person closed says nothing.
  const withKey = async () => {
    setBusy(true);
    setNote(null);
    try {
      const signedIn = await biometrics.signIn();
      if (signedIn.ok) await admit(signedIn.session, "biometric");
      else if (!signedIn.cancelled) {
        setNote("failed");
        felt("error");
        announce(s.failed);
      }
    } catch {
      setNote("failed");
      felt("error");
      announce(s.failed);
    } finally {
      setBusy(false);
    }
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
    void run(
      () =>
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
      null,
      "demo",
    );
  const back = () => {
    setForm(FIELD);
    setNote(null);
    setCode("");
    setDemoCode("");
  };

  const heading = [styles.heading, fontLoaded && styles.bodoni];
  // A refusal sits right under the field it is about: anything lower is under the keyboard
  // on Android, where the page does not scroll clear of it.
  const noteLine = note !== null && (
    <Text testID="sign-in-note" style={text.attention} accessibilityRole="alert">
      {sentence(s, note)}
    </Text>
  );

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
        // On iOS the page scrolls clear of the keyboard. Android does not (the prop is
        // iOS-only), so what a person must see sits close under the field they type in.
        automaticallyAdjustKeyboardInsets
      >
        {form.at === "field" && (
          <>
            <Text
              style={heading}
              accessibilityRole="header"
              accessibilityLabel={s.title}
              maxFontSizeMultiplier={HEADING_GROWS}
            >
              {unbroken(s.title)}
            </Text>
            {keyReady && (
              <Button
                testID="sign-in-key"
                kind="secondary"
                label={s.keySignIn(t.biometric.names[biometrics.name])}
                disabled={busy}
                onPress={() => void withKey()}
              />
            )}
            <Button
              testID="sign-in-google"
              kind="secondary"
              label={s.google}
              mark={
                <Image
                  source={googleG}
                  style={styles.googleG}
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              }
              disabled={busy}
              onPress={() => void withSocial("google")}
            />
            {/* Apple's own button, in its words and drawing, as its guidelines ask. */}
            {Platform.OS === "ios" && (
              <View testID="sign-in-apple" style={styles.apple}>
                <AppleAuthenticationButton
                  buttonType={AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={size.radiusPrimary}
                  style={styles.appleButton}
                  onPress={() => {
                    if (!busy) void withSocial("apple");
                  }}
                />
              </View>
            )}
            <Text style={[text.secondary, styles.or]}>{s.or}</Text>
            <Text style={text.body}>{s.helper}</Text>
            <Text style={text.label}>{s.address}</Text>
            <TextInput
              testID="sign-in-address"
              accessibilityLabel={s.address}
              accessibilityLanguage={speech}
              style={styles.input}
              // No focus as the screen opens: the keyboard would cover what is above the
              // field before it has been read, and Send under it.
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
            {noteLine}
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
            <Text
              style={heading}
              accessibilityRole="header"
              maxFontSizeMultiplier={HEADING_GROWS}
            >
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
              ref={codeField}
              accessibilityLabel={s.code}
              accessibilityLanguage={speech}
              // The texted code is offered above the keyboard, and one tap fills it: iOS by
              // `oneTimeCode`, Android by `sms-otp`.
              style={[styles.input, styles.code]}
              autoFocus
              maxLength={SIGN_IN_CODE_LENGTH}
              value={code}
              // Never made read-only while a code is checked: a field that is loses its
              // focus, and the keyboard goes with it. What is typed meanwhile is ignored.
              onChangeText={(entered) => {
                if (busy) return;
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
            {noteLine}
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
            <Text
              style={heading}
              accessibilityRole="header"
              maxFontSizeMultiplier={HEADING_GROWS}
            >
              {s.demo}
            </Text>
            <Text style={text.body}>{s.demoHelp}</Text>
            <Text style={text.label}>{s.demoPhone}</Text>
            <TextInput
              testID="sign-in-demo-phone"
              accessibilityLabel={s.demoPhone}
              accessibilityLanguage={speech}
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
              accessibilityLanguage={speech}
              style={styles.input}
              value={demoCode}
              onChangeText={setDemoCode}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={demo}
            />
            {noteLine}
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
  const speech = useSpeech();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLanguage={speech}
      accessibilityState={{ disabled, ...(expanded !== undefined && { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      style={styles.textButton}
    >
      {/* Keyed by its state: Android draws a style that changes back without its
          underline, and a fresh label is drawn whole. */}
      <Text
        key={disabled ? "off" : "on"}
        style={[styles.textButtonLabel, disabled && styles.textButtonDisabled]}
      >
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
    color: color.action,
    textDecorationLine: "underline",
  },
  // Disabled while a request is out: muted, and still underlined, so the link looks the same
  // once it comes back (Android drew it again without its underline).
  textButtonDisabled: { color: color.muted },
  trouble: { gap: space[2] },
  // Google's "G" at the size of its own assets, 20 pt in a 44 pt button.
  googleG: { width: 20, height: 20 },
  apple: { minHeight: size.target },
  appleButton: { height: size.target, width: "100%" },
  or: { textAlign: "center" },
});
