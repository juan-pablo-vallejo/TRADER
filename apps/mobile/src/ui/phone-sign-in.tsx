// Sign-in by a code sent to the person's phone (ARCHITECTURE, 2026-11-12: SMS-code sign-in
// for the crew; TASKS R5). The identity provider sends and checks the code; this screen
// only asks for the number and then the code. Nobody signs up here: a number the provider
// does not know, or one no roster holds, is told to ask the office. Rendered only inside
// the provider (app/_layout.tsx), in a build that has its key.
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
  const [step, setStep] = useState<"phone" | "code">("phone");
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
      await signIn.finalize();
      // The provider knows the number; whether a roster does is the server's to say.
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
