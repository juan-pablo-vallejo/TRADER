// The app's one Text: React Native's, spoken by a screen reader in the language chosen in the
// app, so Spanish words are not read with an English voice. `accessibilityLanguage` is
// iOS's (React Native's View and Text props); Android's TalkBack reads with the phone's
// own voice. Every screen imports Text from here; a test holds them to it.
import type { ComponentProps } from "react";
import { Text as NativeText } from "react-native";

import { useSpeech } from "../i18n";

export function Text(props: ComponentProps<typeof NativeText>) {
  const speech = useSpeech();
  return <NativeText accessibilityLanguage={speech} {...props} />;
}
