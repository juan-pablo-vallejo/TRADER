// Me, for a person whose login has no email (invited by number alone): add one, and sign
// in with it too. Two steps, each one call: the email, to which the server mails a code
// (me.sendEmailCode), then the code (me.addEmail). Only once the code comes back is the
// email the person's; from then on it shows greyed with the number, and the office changes
// it. A refusal is said in the server's own terms (catalog, addEmail.refused), beside the
// step it belongs to, and aloud. Needs a connection: a call that does not go through says so.
import { signInIdentifier } from "@trader/api/contract";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Api } from "../api";
import { announce, felt } from "../feedback";
import { useSpeech, useStrings } from "../i18n";
import { border, color, size, space, type } from "../theme";
import { Button, text } from "./controls";
import { Field } from "./field";
import { Text } from "./text";

type Refusal = keyof ReturnType<typeof useStrings>["t"]["addEmail"]["refused"];

export function AddEmail({ api, onAdded }: { api: Api; onAdded: () => void }) {
  const { t, language } = useStrings();
  const a = t.addEmail;
  const speech = useSpeech();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Refusal | "invalid" | null>(null);

  const say = (what: Refusal | "invalid") => {
    setNote(what);
    felt("error");
    announce(what === "invalid" ? a.invalid : a.refused[what]);
  };

  const send = async () => {
    // The sign-in screen's own reading of an address: an email, and nothing else.
    const typed = signInIdentifier(email);
    if (typed === null || typed.kind !== "email") return say("invalid");
    setBusy(true);
    setNote(null);
    try {
      const answer = await api.me.sendEmailCode.mutate({ email: typed.email, language });
      if (answer.result === "sent") {
        setEmail(typed.email);
        setCode("");
        setStep("code");
      } else {
        say(answer.code);
      }
    } catch {
      say("failed");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    setNote(null);
    try {
      const answer = await api.me.addEmail.mutate({ code });
      if (answer.result === "added") {
        felt("success");
        announce(a.added);
        onAdded();
      } else {
        say(answer.code);
        // A code that can no longer work: back to the email, to ask for a new one.
        if (answer.code === "no_code") setStep("email");
      }
    } catch {
      say("failed");
    } finally {
      setBusy(false);
    }
  };

  const message =
    note === null ? null : (
      <Text
        testID="add-email-refused"
        accessibilityLiveRegion="polite"
        style={text.attention}
      >
        {note === "invalid" ? a.invalid : a.refused[note]}
      </Text>
    );

  return (
    <View testID="add-email" style={styles.box}>
      <Text style={text.label} accessibilityRole="header">
        {a.title}
      </Text>
      {step === "email" ? (
        <>
          <Text style={text.secondary}>{a.help}</Text>
          <Field
            testID="add-email-address"
            accessibilityLabel={a.email}
            accessibilityLanguage={speech}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
          {message}
          <Button
            testID="add-email-send"
            kind="secondary"
            label={busy ? a.sending : a.send}
            disabled={busy || email.trim() === ""}
            onPress={() => void send()}
          />
        </>
      ) : (
        <>
          <Text style={text.body}>{a.codeTitle(email)}</Text>
          <Text style={text.secondary}>{a.codeHelp}</Text>
          <Field
            testID="add-email-code"
            accessibilityLabel={a.code}
            accessibilityLanguage={speech}
            style={styles.input}
            value={code}
            onChangeText={(typed) => setCode(typed.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          {message}
          <Button
            testID="add-email-add"
            label={busy ? a.adding : a.add}
            disabled={busy || code.length !== 6}
            onPress={() => void add()}
          />
          <Button
            testID="add-email-again"
            kind="secondary"
            label={a.again}
            disabled={busy}
            onPress={() => void send()}
          />
          <Button
            testID="add-email-other"
            kind="secondary"
            label={a.other}
            disabled={busy}
            onPress={() => {
              setNote(null);
              setStep("email");
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space[3] },
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
});
