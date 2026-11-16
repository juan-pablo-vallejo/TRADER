// The signed-in app: Today, the worker's own schedule, and Settings, over the sync layer
// they all read. Nobody signed in is sent to sign in.
import { Redirect, Tabs } from "expo-router";

import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { SyncProvider } from "../../sync/provider";
import { color } from "../../theme";

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
          tabBarLabelStyle: { fontSize: 15, fontWeight: "600" },
          tabBarIconStyle: { display: "none" },
        }}
      >
        <Tabs.Screen
          name="today"
          options={{ title: t.tabs.today, tabBarButtonTestID: "tab-today" }}
        />
        <Tabs.Screen
          name="week"
          options={{ title: t.tabs.week, tabBarButtonTestID: "tab-week" }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: t.tabs.settings, tabBarButtonTestID: "tab-settings" }}
        />
      </Tabs>
    </SyncProvider>
  );
}
