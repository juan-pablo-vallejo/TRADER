// The signed-in app: Today, the worker's own schedule, and Settings, over the sync layer
// they all read. Nobody signed in is sent to sign in.
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { SyncProvider } from "../../sync/provider";
import { color } from "../../theme";

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
  const { t } = useStrings();
  const { session } = useSession();
  if (session === undefined) return null;
  if (session === null) return <Redirect href="/sign-in" />;
  return (
    <SyncProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.accent,
          tabBarInactiveTintColor: color.inkSecondary,
          tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
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
          name="settings"
          options={{
            title: t.tabs.settings,
            tabBarButtonTestID: "tab-settings",
            tabBarIcon: icon("person-outline"),
          }}
        />
      </Tabs>
    </SyncProvider>
  );
}
