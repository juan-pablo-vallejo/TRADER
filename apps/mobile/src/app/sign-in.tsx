// Sign-in. A build with the identity provider's key signs in by a code sent to the phone
// (ui/phone-sign-in.tsx). A development build that asked for it has the development
// identity instead (config.ts): an email, which the server either knows on a roster or
// does not. A build with neither says so in words.
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { createApi, devHeaders } from "../api";
import { apiUrl, clerkKey, devIdentity } from "../config";
import { useStrings } from "../i18n";
import { useSession } from "../session";
import { color, size, space, type } from "../theme";
import { Button, Screen, text } from "../ui/controls";
import { PhoneSignIn } from "../ui/phone-sign-in";

export default function SignIn() {
  const { t } = useStrings();
  const { signIn } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (clerkKey !== null && apiUrl !== null) return <PhoneSignIn apiUrl={apiUrl} />;
  if (!devIdentity || apiUrl === null) {
    return (
      <Screen testID="sign-in-unavailable">
        <Text style={text.title}>{t.signIn.title}</Text>
        <Text style={text.body}>{t.signIn.unavailable}</Text>
      </Screen>
    );
  }
  const url = apiUrl;
  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (address === "") return;
    setBusy(true);
    setNote(null);
    try {
      // Asked once, to know the server knows this person; who they are comes with the pull.
      await createApi(url, () => devHeaders(address)).me.get.query();
      await signIn({ kind: "dev", email: address });
      router.replace("/today");
    } catch (error) {
      const code = (error as { data?: { code?: string } } | null)?.data?.code;
      setNote(code === "UNAUTHORIZED" ? t.signIn.notOnRoster : t.signIn.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen testID="sign-in">
      <Text style={text.title}>{t.signIn.title}</Text>
      <Text style={text.secondary}>{t.signIn.developmentOnly}</Text>
      <Text style={text.label}>{t.signIn.email}</Text>
      <TextInput
        testID="sign-in-email"
        accessibilityLabel={t.signIn.email}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button
        testID="sign-in-submit"
        label={busy ? t.loading : t.signIn.submit}
        disabled={busy}
        onPress={() => void submit()}
      />
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
