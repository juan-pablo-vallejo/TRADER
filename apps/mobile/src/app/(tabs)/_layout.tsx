// The signed-in app: two tabs in this build, Today and Settings (the worker's week joins
// them in TASKS S8). Nobody signed in is sent to sign in.
import { Redirect, Tabs } from "expo-router";

import { useStrings } from "../../i18n";
import { useSession } from "../../session";
import { color } from "../../theme";

export default function TabsLayout() {
  const { t } = useStrings();
  const { session } = useSession();
  if (session === null) return <Redirect href="/sign-in" />;
  return (
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
        name="settings"
        options={{ title: t.tabs.settings, tabBarButtonTestID: "tab-settings" }}
      />
    </Tabs>
  );
}
