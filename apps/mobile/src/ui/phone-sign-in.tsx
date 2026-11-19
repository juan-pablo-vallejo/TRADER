// Sign-in by a code sent to the person's phone. The identity provider sends and checks the
// code; this screen
// only asks for the number and then the code. Nobody signs up here: a number the provider
// does not know, or one no roster holds, is told to ask the office. Rendered only inside
// the provider (app/_layout.tsx), in a build that has its key.
//
// One other way in, for the Demo company only: its person's number and the demo code, which
// the API answers with a single-use ticket and no text message (packages/api,
// core/demo-door.ts). It is what Apple's beta review is given. Everyone else is refused
// there with one answer, and signs in by the texted code.
import { useClerk, useSignIn } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { createApi } from "../api";
import { useStrings } from "../i18n";
import { signInPhone } from "../phone";
import { bearer, useSession } from "../session";
import { color, size, space, type } from "../theme";
import { Button, Screen, text } from "./controls";

export function PhoneSignIn({ apiUrl }: { apiUrl: string }) {
  const { t } = useStrings();
  const { signIn: keep } = useSession();
  const { signIn } = useSignIn();
  const clerk = useClerk();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "demo">("phone");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const send = async () => {
    const number = signInPhone(phone);
    if (number === null) {
      setNote(t.signIn.badPhone);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const started = await signIn.create({ identifier: number });
      if (started.error !== null) {
        // The provider does not say whether a number exists, and neither does this.
        setNote(t.signIn.notOnRoster);
        return;
      }
      const sent = await signIn.phoneCode.sendCode({ phoneNumber: number });
      if (sent.error !== null) {
        setNote(t.signIn.failed);
        return;
      }
      setCode("");
      setStep("code");
    } catch {
      setNote(t.signIn.failed);
    } finally {
      setBusy(false);
    }
  };

  // The provider's sign-in is complete: make it the session, and ask the server whether a
  // roster holds this person. The provider knows the number; that is the server's to say.
  const enter = async () => {
    await signIn.finalize();
    try {
      await createApi(apiUrl, bearer).me.get.query();
    } catch (error) {
      const refused =
        (error as { data?: { code?: string } } | null)?.data?.code === "UNAUTHORIZED";
      if (refused) await clerk.signOut();
      setNote(refused ? t.signIn.notOnRoster : t.signIn.failed);
      if (refused) setStep("phone");
      return;
    }
    await keep({ kind: "clerk" });
    router.replace("/today");
  };

  const verify = async () => {
    if (code.trim() === "") return;
    setBusy(true);
    setNote(null);
    try {
      const checked = await signIn.phoneCode.verifyCode({ code: code.trim() });
      if (checked.error !== null || signIn.status !== "complete") {
        setNote(t.signIn.badCode);
        return;
      }
      await enter();
    } catch {
      setNote(t.signIn.failed);
    } finally {
      setBusy(false);
    }
  };

  // The Demo company's way in. The API's one refusal is shown as one sentence: it does not
  // say which of the number and the code was wrong, and neither does this.
  const demo = async () => {
    const number = signInPhone(phone);
    if (number === null) {
      setNote(t.signIn.badPhone);
      return;
    }
    if (demoCode.trim() === "") return;
    setBusy(true);
    setNote(null);
    try {
      const answer = await createApi(apiUrl, bearer).demo.signIn.mutate({
        phone: number,
        code: demoCode.trim(),
      });
      if (answer.result !== "ticket") {
        setNote(t.signIn.badDemo);
        return;
      }
      const redeemed = await signIn.ticket({ ticket: answer.ticket });
      if (redeemed.error !== null || signIn.status !== "complete") {
        setNote(t.signIn.failed);
        return;
      }
      setDemoCode("");
      await enter();
    } catch {
      setNote(t.signIn.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="sign-in">
      <Text style={text.title}>{t.signIn.title}</Text>
      {step === "phone" ? (
        <>
          <Text style={text.label}>{t.signIn.phone}</Text>
          <TextInput
            testID="sign-in-phone"
            accessibilityLabel={t.signIn.phone}
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="go"
            onSubmitEditing={() => void send()}
          />
          <Button
            testID="sign-in-send"
            label={busy ? t.loading : t.signIn.sendCode}
            disabled={busy}
            onPress={() => void send()}
          />
          <Button
            testID="sign-in-demo"
            kind="secondary"
            label={t.signIn.demo}
            disabled={busy}
            onPress={() => {
              setNote(null);
              setStep("demo");
            }}
          />
        </>
      ) : step === "demo" ? (
        <>
          <Text style={text.body}>{t.signIn.demoHelp}</Text>
          <Text style={text.label}>{t.signIn.phone}</Text>
          <TextInput
            testID="sign-in-demo-phone"
            accessibilityLabel={t.signIn.phone}
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
          />
          <Text style={text.label}>{t.signIn.demoCode}</Text>
          <TextInput
            testID="sign-in-demo-code"
            accessibilityLabel={t.signIn.demoCode}
            style={styles.input}
            value={demoCode}
            onChangeText={setDemoCode}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={() => void demo()}
          />
          <Button
            testID="sign-in-demo-submit"
            label={busy ? t.loading : t.signIn.demoSubmit}
            disabled={busy}
            onPress={() => void demo()}
          />
          <Button
            testID="sign-in-demo-back"
            kind="secondary"
            label={t.signIn.back}
            disabled={busy}
            onPress={() => {
              setNote(null);
              setDemoCode("");
              setStep("phone");
            }}
          />
        </>
      ) : (
        <>
          <Text style={text.body}>{t.signIn.codeSent}</Text>
          <Text style={text.label}>{t.signIn.code}</Text>
          <TextInput
            testID="sign-in-code"
            accessibilityLabel={t.signIn.code}
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            returnKeyType="go"
            onSubmitEditing={() => void verify()}
          />
          <Button
            testID="sign-in-verify"
            label={busy ? t.loading : t.signIn.submit}
            disabled={busy}
            onPress={() => void verify()}
          />
          <Button
            testID="sign-in-change-number"
            kind="secondary"
            label={t.signIn.changeNumber}
            disabled={busy}
            onPress={() => {
              setNote(null);
              setStep("phone");
            }}
          />
        </>
      )}
      {note !== null && (
        <Text testID="sign-in-note" style={text.attention} accessibilityRole="alert">
          {note}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: size.target,
    paddingHorizontal: space[3],
    borderRadius: size.radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.ink,
    fontSize: type.body.fontSize,
  },
});
