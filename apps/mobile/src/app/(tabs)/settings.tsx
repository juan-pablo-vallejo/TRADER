// Settings: who is signed in, the language, and the way out.
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";

export default function Settings() {
  const { t, language, setLanguage } = useStrings();
  const { session, signOut } = useSession();
  const router = useRouter();
  return (
    <Screen testID="settings">
      <Text style={text.title}>{t.settings.title}</Text>
      {session !== null && (
        <Text testID="settings-name" style={text.body}>
          {t.settings.signedInAs(session.me.name)}
        </Text>
      )}
      <Text style={text.label}>{t.settings.language}</Text>
      <View style={{ gap: space[2] }}>
        <Button
          testID="language-en"
          kind={language === "en" ? "primary" : "secondary"}
          label={t.settings.english}
          onPress={() => setLanguage("en")}
        />
        <Button
          testID="language-es"
          kind={language === "es" ? "primary" : "secondary"}
          label={t.settings.spanish}
          onPress={() => setLanguage("es")}
        />
      </View>
      <Button
        testID="sign-out"
        kind="secondary"
        label={t.settings.signOut}
        onPress={() => {
          signOut();
          router.replace("/sign-in");
        }}
      />
    </Screen>
  );
}
