// Shift reminders, the part that touches the phone. What to remind of is decided by one
// pure function (sync/reminders.ts); this keeps the phone's pending notifications equal to
// its answer, after every pull and every tap, in the language chosen in the app.
//
// Local notifications only: the phone's own alarm, set from the shifts it already holds.
// No push token is ever asked for, and the build carries no push entitlement (app.json,
// `enableRemoteNotifications: false`). No exact-alarm permission either, so on Android a
// reminder may come a few minutes late.
//
// The setting lives on the phone (the store's key-value table): never asked, on, or off.
// Permission is asked once, after the first clock-in, behind one sentence of why (Today);
// refused, the app works as before. The switch in Me turns reminders on or off after that.
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import { wallTime } from "./format";
import { useStrings } from "./i18n";
import { deviceStore } from "./store/device";
import { useSync } from "./sync/provider";
import { reconcile, reminders } from "./sync/reminders";
import { color } from "./theme";

const KEY = "reminders";
const CHANNEL = "shifts";

export type RemindersSetting = "on" | "off" | null;

type Value = {
  // Null until the person has been asked.
  setting: RemindersSetting;
  // Asks the phone for permission and turns reminders on; false when the phone refused.
  turnOn: () => Promise<boolean>;
  turnOff: () => Promise<void>;
};
const RemindersContext = createContext<Value | null>(null);

// A reminder that arrives while the app is in front is still shown: the person may be
// looking at Week, not at the clock.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

async function allowed(ask: boolean): Promise<boolean> {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && ask && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  }
  return permission.granted;
}

export function RemindersProvider({ children }: { children: ReactNode }) {
  const { t, language } = useStrings();
  const { snapshot, clock } = useSync();
  const router = useRouter();
  const [setting, setSetting] = useState<RemindersSetting>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void deviceStore.read(KEY).then((kept) => {
      setSetting(kept === "on" || kept === "off" ? kept : null);
      setLoaded(true);
    });
  }, []);

  const keep = useCallback(async (next: "on" | "off") => {
    await deviceStore.write(KEY, next);
    setSetting(next);
  }, []);
  const turnOn = useCallback(async () => {
    const granted = await allowed(true).catch(() => false);
    await keep(granted ? "on" : "off");
    return granted;
  }, [keep]);
  const turnOff = useCallback(() => keep("off"), [keep]);

  // A tap on a reminder opens Today.
  useEffect(() => {
    const tapped = Notifications.addNotificationResponseReceivedListener(() => {
      router.navigate("/today");
    });
    return () => tapped.remove();
  }, [router]);

  // The pending set follows the pull, the clock, the setting and the language: this runs
  // after every pull and every tap, because each changes one of them.
  const data = snapshot?.data ?? null;
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    const apply = async () => {
      const enabled = setting === "on" && data !== null && (await allowed(false));
      const wanted = reminders({
        enabled,
        shifts: data?.shifts ?? [],
        clock,
        timeZone: data?.company.timezone ?? "UTC",
        now: Date.now(),
      });
      const pending = await Notifications.getAllScheduledNotificationsAsync();
      if (!live) return;
      const { cancel, schedule } = reconcile(
        pending.map((p) => p.identifier),
        wanted,
      );
      for (const id of cancel) await Notifications.cancelScheduledNotificationAsync(id);
      if (schedule.length > 0 && Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL, {
          name: t.reminders.channel,
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: color.accent,
        });
      }
      for (const r of schedule) {
        const time = wallTime(r.wall, language);
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: {
            title:
              r.kind === "start"
                ? t.reminders.startTitle(r.jobName)
                : t.reminders.endTitle(r.jobName),
            body:
              r.kind === "start"
                ? t.reminders.startBody(time)
                : t.reminders.endBody(time),
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: r.at,
            channelId: CHANNEL,
          },
        });
      }
    };
    // A phone that will not schedule is a phone without reminders, never a broken clock.
    void apply().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [loaded, setting, data, clock, language, t]);

  const value = useMemo(() => ({ setting, turnOn, turnOff }), [setting, turnOn, turnOff]);
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): Value {
  const value = useContext(RemindersContext);
  if (value === null) throw new Error("useReminders needs RemindersProvider above it");
  return value;
}
