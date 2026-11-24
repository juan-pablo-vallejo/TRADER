// One screen, after a sign-in by code on a phone that can hold a key (biometric-rules.ts,
// offersBiometric): sign in next time with Face ID or fingerprint, the passcode standing in.
// Turned on, the key is made for this person and replaces any other's; "Not now" is kept for
// this person on this phone, and Me turns it on later. Either way, then Today.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View, StyleSheet } from "react-native";

import { DECLINED_BY, KEY_FOR, useBiometrics } from "../biometrics";
import { useStrings } from "../i18n";
import { useSession } from "../session";
import { deviceStore } from "../store/device";
import { space } from "../theme";
import { Button, Screen, text } from "../ui/controls";
import { Mark } from "../ui/mark";

export default function BiometricOffer() {
  const { t } = useStrings();
  const b = t.biometric;
  const { who } = useLocalSearchParams<{ who: string }>();
  const { session } = useSession();
  const biometrics = useBiometrics();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = b.names[biometrics.name];

  const turnOn = async () => {
    if (session === null || session === undefined) return;
    setBusy(true);
    setFailed(false);
    const made = await biometrics.enroll(session, b.prompt);
    setBusy(false);
    if (!made) {
      setFailed(true);
      return;
    }
    await deviceStore.write(KEY_FOR, who);
    router.replace("/today");
  };
  const notNow = async () => {
    await deviceStore.write(DECLINED_BY, who);
    router.replace("/today");
  };

  return (
    <Screen testID="biometric-offer">
      <Mark />
      <Text style={text.title} accessibilityRole="header">
        {b.offerTitle}
      </Text>
      <Text style={text.body}>{b.offerBody(name)}</Text>
      <View style={styles.actions}>
        <Button
          testID="biometric-on"
          label={busy ? t.loading : b.turnOn(name)}
          disabled={busy}
          onPress={() => void turnOn()}
        />
        <Button
          testID="biometric-not-now"
          kind="secondary"
          label={b.notNow}
          disabled={busy}
          onPress={() => void notNow()}
        />
      </View>
      {failed && (
        <Text testID="biometric-failed" style={text.attention} accessibilityRole="alert">
          {b.failed}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: space[3] } });
