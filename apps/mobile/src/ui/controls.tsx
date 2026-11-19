// The phone app's controls: a primary button 56 pt tall and full
// width, one a screen; a secondary one 48 pt. Every control carries a `testID`: a
// Maestro flow selects by it, never by text, which is in two languages.
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

import { color, size, space, type } from "../theme";

export function Button({
  label,
  testID,
  onPress,
  disabled = false,
  kind = "primary",
}: {
  label: string;
  testID: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary";
}) {
  const primary = kind === "primary";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary ? styles.primary : styles.secondary,
        disabled && primary && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: primary ? color.onAccent : color.ink }]}>
        {label}
      </Text>
    </Pressable>
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
  },
  primary: { minHeight: size.primary, backgroundColor: color.accent },
  secondary: {
    minHeight: size.target,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  disabled: { backgroundColor: color.muted },
  buttonLabel: { ...(type.bodyStrong as TextStyle) },
});
