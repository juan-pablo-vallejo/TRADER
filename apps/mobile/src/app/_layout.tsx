// The app's shell: the identity provider when this build has one, the language, the
// session, then the screens. A build that was not told
// where its API is says so and goes no further — never a guess at an address.
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { type ErrorBoundaryProps, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { maybeCompleteAuthSession } from "expo-web-browser";
import { useEffect } from "react";

import { apiUrl, clerkKey } from "../config";
import {
  reportScreen,
  reportScreenFailure,
  startReporting,
  withReporting,
} from "../report";
import { StringsProvider } from "../i18n";
import { SessionProvider } from "../session";
import { Screen, text } from "../ui/controls";
import { Fallback } from "../ui/fallback";
import { Text } from "../ui/text";

// Before anything is drawn, so an error in the first render is reported too. With no DSN
// in the build this does nothing (report.ts).
startReporting();
// Google's sheet, closed by the redirect it was waiting for (sign-in-provider.ts).
maybeCompleteAuthSession();

function RootLayout() {
  const pathname = usePathname();
  useEffect(() => reportScreen(pathname), [pathname]);
  if (apiUrl === null) {
    return (
      <Screen testID="config-missing">
        <Text style={text.body}>EXPO_PUBLIC_API_URL is not set for this build.</Text>
      </Screen>
    );
  }
  const app = (
    <StringsProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </StringsProvider>
  );
  // The provider's session lives in the phone's secure store, not in the app's own files.
  return clerkKey === null ? (
    app
  ) : (
    <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
      {app}
    </ClerkProvider>
  );
}

export default withReporting(RootLayout);

// The last fallback: the app's own shell threw, so not even the language is known. Both
// languages, reported, and tried again on a tap; what the phone holds is untouched.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportScreenFailure(error), [error]);
  return (
    <Fallback
      testID="app-failed"
      code="TRADER"
      title="Something went wrong. · Algo salió mal."
      body="Nothing on this phone was lost. Try again. · No se perdió nada en este teléfono. Inténtalo de nuevo."
      action={{ label: "Try again · Intentar de nuevo", onPress: () => void retry() }}
      reference={`Reference · Referencia: ${error.message}`}
    />
  );
}
