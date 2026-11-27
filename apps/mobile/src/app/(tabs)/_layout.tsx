// The signed-in app: Today, the person's own week, Crew for an admin, and Me, over the sync
// layer they all read. Nobody signed in is sent to sign in.
import { Ionicons } from "@expo/vector-icons";
import { type ErrorBoundaryProps, Redirect, Tabs, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { type ColorValue, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useStrings } from "../../i18n";
import { reportScreenFailure } from "../../report";
import { Fallback } from "../../ui/fallback";
import { Text } from "../../ui/text";
import { RemindersProvider } from "../../reminders";
import { useSession } from "../../session";
import { opensOnCrew } from "../../sync/crew";
import { SyncProvider, useSync } from "../../sync/provider";
import { color, size, type } from "../../theme";

// An icon beside each word: the word stays, so the tab is never an icon alone.
const icon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color: tint, size }: { color: ColorValue; size: number }) => (
    <Ionicons
      name={name}
      size={size}
      color={typeof tint === "string" ? tint : undefined}
    />
  );

export default function TabsLayout() {
  const { session } = useSession();
  if (session === undefined) return null;
  if (session === null) return <Redirect href="/sign-in" />;
  return (
    <SyncProvider>
      <RemindersProvider>
        <AppTabs />
      </RemindersProvider>
    </SyncProvider>
  );
}

// The tabs, inside the sync layer: which of them exist is the last pull's to say.
function AppTabs() {
  const { t } = useStrings();
  const { snapshot } = useSync();
  const router = useRouter();
  const data = snapshot?.data ?? null;
  const admin = data?.me.role === "admin";
  const insets = useSafeAreaInsets();

  // An admin with no shift today opens the app on Crew: once, the first time this launch
  // knows who is signed in and what their day holds. After that the tabs are theirs.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || data === null) return;
    placed.current = true;
    if (opensOnCrew(data, Date.now())) router.replace("/crew");
  }, [data, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.action,
        tabBarInactiveTintColor: color.inkSecondary,
        // The library's bar is 49 pt above the home bar: an icon and a 20 pt line do not fit
        // it, and on a phone with no home bar (an iPhone SE) the label's foot is cut by the
        // screen's edge. The primary button's height gives them room.
        tabBarStyle: { height: size.primary + insets.bottom },
        // The word, in the app's Text, on one line that shrinks to the tab's width: with
        // four tabs at the largest text, "Semana" and "Equipo" no longer fit a quarter of a
        // small phone, and the library's own label would end them in "...".
        tabBarLabel: ({ color: ink, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.tabLabel, { color: ink }]}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: t.tabs.today,
          tabBarButtonTestID: "tab-today",
          tabBarIcon: icon("time-outline"),
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: t.tabs.week,
          tabBarButtonTestID: "tab-week",
          tabBarIcon: icon("calendar-outline"),
        }}
      />
      <Tabs.Screen
        name="crew"
        options={{
          title: t.tabs.crew,
          tabBarButtonTestID: "tab-crew",
          tabBarIcon: icon("people-outline"),
          // Admins only: for anyone else the tab does not exist.
          href: admin ? "/crew" : null,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t.tabs.me,
          tabBarButtonTestID: "tab-me",
          tabBarIcon: icon("person-outline"),
        }}
      />
    </Tabs>
  );
}

// A tab that threw: said in the person's language, reported, and tried again on a tap.
// The tabs, the session and the phone's record are untouched.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useStrings();
  useEffect(() => reportScreenFailure(error), [error]);
  return (
    <Fallback
      testID="screen-failed"
      code={t.fallback.errorCode}
      title={t.fallback.errorTitle}
      body={t.fallback.errorBody}
      action={{ label: t.fallback.tryAgain, onPress: () => void retry() }}
      reference={`${t.fallback.reference}: ${error.message}`}
    />
  );
}

// 15 pt on its 20 pt line, as `type.label` is (theme.ts): Inter's own line is too short for
// a "y" on a phone with a short tab bar.
const styles = StyleSheet.create({
  tabLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: "600",
    textAlign: "center",
  },
});
