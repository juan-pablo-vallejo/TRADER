// The app's one Pressable: spoken in the app's language, and never under the 48-point
// target (theme.ts), whatever the screen draws inside it. Screens take it, not React
// Native's; a test holds them to it (test/styles.test.ts).
import type { ComponentProps } from "react";
import { Pressable, type PressableStateCallbackType, StyleSheet } from "react-native";

import { useSpeech } from "../i18n";
import { size } from "../theme";

type Props = ComponentProps<typeof Pressable>;

export function Press({ style, ...props }: Props) {
  const speech = useSpeech();
  return (
    <Pressable
      accessibilityLanguage={speech}
      {...props}
      style={(state: PressableStateCallbackType) => [
        styles.target,
        typeof style === "function" ? style(state) : style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  target: { minHeight: size.target, minWidth: size.target },
});
