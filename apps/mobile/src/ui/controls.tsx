// The phone app's controls: a primary button 56 pt tall and full
// width, one a screen; a secondary one 48 pt. A label too long for one line, as Spanish
// often is, takes a second and the button grows with it: it is never cut short. Every control carries a `testID`: a
// Maestro flow selects by it, never by text, which is in two languages.
import { Pressable, StyleSheet, type TextStyle, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

import { useSpeech } from "../i18n";
import { color, size, space, type } from "../theme";
import { Text } from "./text";

export function Button({
  label,
  testID,
  onPress,
  disabled = false,
  kind = "primary",
  selected,
  mark,
  spoken,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  disabled?: boolean;
  // `brand`: the sign-in screen's one button, in D'Sierra's red as the office's is.
  kind?: "primary" | "secondary" | "brand";
  // One side of a pair: read as a radio button, selected or not, inside a `Pair`.
  selected?: boolean;
  // A mark drawn before the words, a vendor's own where its rules ask for one.
  mark?: ReactNode;
  // What a screen reader says, where the words shown are not the whole of it.
  spoken?: string;
}) {
  const primary = kind !== "secondary";
  const speech = useSpeech();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={selected === undefined ? "button" : "radio"}
      accessibilityLabel={spoken ?? label}
      accessibilityLanguage={speech}
      accessibilityState={{ disabled, ...(selected !== undefined && { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary ? styles.primary : styles.secondary,
        kind === "brand" && styles.brand,
        disabled && primary && styles.disabled,
        mark !== undefined && styles.withMark,
      ]}
    >
      {mark}
      <Text
        numberOfLines={2}
        style={[styles.buttonLabel, { color: primary ? color.onAccent : color.ink }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Two buttons side by side, one of them chosen: a radio group, each side's selected state
// said, as Crew's view switch is.
export function Pair({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="radiogroup" style={styles.pair}>
      {children}
    </View>
  );
}

export function Screen({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    // Inside the safe area: nothing of a screen sits under the clock or the home bar.
    <SafeAreaView testID={testID} style={styles.screen} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

export const text = StyleSheet.create({
  title: { ...(type.title as TextStyle), color: color.ink },
  heading: { ...(type.heading as TextStyle), color: color.ink },
  body: { ...(type.body as TextStyle), color: color.ink },
  bodyStrong: { ...(type.bodyStrong as TextStyle), color: color.ink },
  secondary: { ...(type.secondary as TextStyle), color: color.inkSecondary },
  label: { ...(type.label as TextStyle), color: color.inkSecondary },
  attention: { ...(type.secondary as TextStyle), color: color.attention },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas, padding: space[4], gap: space[4] },
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: size.radiusPrimary,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  primary: { minHeight: size.primary, backgroundColor: color.accent },
  brand: { backgroundColor: color.brand },
  secondary: {
    minHeight: size.target,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.controlBorder,
  },
  disabled: { backgroundColor: color.muted },
  buttonLabel: { ...(type.bodyStrong as TextStyle), textAlign: "center" },
  withMark: { flexDirection: "row", gap: space[3] },
  pair: { flexDirection: "row", gap: space[2] },
});
