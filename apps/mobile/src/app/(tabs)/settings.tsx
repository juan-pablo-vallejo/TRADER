// Settings: who is signed in, where this phone's entries stand, the language, the way out.
// Signing out never discards an entry: what has not been sent stays in the outbox under its
// owner and goes when they sign in again, and the screen says so before the button.
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { useSync } from "../../sync/provider";
import { space } from "../../theme";
import { Button, Screen, text } from "../../ui/controls";
import { SyncBanner } from "../../ui/sync-banner";

export default function Settings() {
  const { t, language, setLanguage } = useStrings();
  const { signOut } = useSession();
  const { snapshot, records, sync, syncing } = useSync();
  const router = useRouter();
  const unsent = records.filter(
    (r) => r.standing === "pending" || r.standing === "syncing",
  ).length;
  return (
    <Screen testID="settings">
      <ScrollView contentContainerStyle={{ gap: space[4], paddingBottom: space[6] }}>
        <Text style={text.title}>{t.settings.title}</Text>
        {snapshot !== null && (
          <Text testID="settings-name" style={text.body}>
            {t.settings.signedInAs(snapshot.data.me.name)}
          </Text>
        )}
        <SyncBanner />
        <Button
          testID="sync-now"
          kind="secondary"
          label={syncing ? t.sync.working : t.sync.now}
          disabled={syncing}
          onPress={() => void sync()}
        />
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
        {unsent > 0 && (
          <Text testID="sign-out-unsent" style={text.attention}>
            {t.settings.unsentKept(unsent)}
          </Text>
        )}
        <Button
          testID="sign-out"
          kind="secondary"
          label={t.settings.signOut}
          onPress={() => {
            void signOut().then(() => router.replace("/sign-in"));
          }}
        />
      </ScrollView>
    </Screen>
  );
}
