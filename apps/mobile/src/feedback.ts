// A verdict felt and heard: the one haptic and the one spoken announcement every screen
// uses once a verdict is true (saved, not saved, refused). The announcement is spoken by
// VoiceOver and TalkBack alike; a phone with no haptics, or none switched on, stays quiet,
// and neither ever throws into the screen that asked.
import * as Haptics from "expo-haptics";
import { AccessibilityInfo } from "react-native";

export function felt(verdict: "success" | "error"): void {
  void Haptics.notificationAsync(
    verdict === "success"
      ? Haptics.NotificationFeedbackType.Success
      : Haptics.NotificationFeedbackType.Error,
  ).catch(() => undefined);
}

export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
