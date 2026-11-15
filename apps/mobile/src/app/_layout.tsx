// The app's shell: the language, the session, then the screens. A build that was not told
// where its API is says so and goes no further — never a guess at an address.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";

import { apiUrl } from "../config";
import { StringsProvider } from "../i18n";
import { SessionProvider } from "../session";
import { Screen, text } from "../ui/controls";

export default function RootLayout() {
  if (apiUrl === null) {
    return (
      <Screen testID="config-missing">
        <Text style={text.body}>EXPO_PUBLIC_API_URL is not set for this build.</Text>
      </Screen>
    );
  }
  return (
    <StringsProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </StringsProvider>
  );
}
