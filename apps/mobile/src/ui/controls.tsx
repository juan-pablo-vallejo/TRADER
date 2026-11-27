// The phone app's controls: a primary button 56 pt tall and full
// width, one a screen; a secondary one 48 pt. A label too long for one line, as Spanish
// often is, takes a second and the button grows with it: it is never cut short. Every control carries a `testID`: a
// Maestro flow selects by it, never by text, which is in two languages.
import { Pressable, StyleSheet, type TextStyle, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";

import { useSpeech } from "../i18n";
import { useLayout } from "../layout";
import { border, color, size, space, type } from "../theme";
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
  // `primary`: an action, in D'Sierra's red; the chosen side of a pair is their navy.
  // `brand`: the sign-in screen's button, the same red.
  kind?: "primary" | "secondary" | "brand";
  // One side of a pair: read as a radio button, selected or not, inside a `Pair`.
  selected?: boolean;
  // A mark drawn before the words, a vendor's own where its rules ask for one.
  mark?: ReactNode;
  // What a screen reader says, where the words shown are not the whole of it.
  spoken?: string;
}) {
  const primary = kind !== "secondary";
  // A primary button that is one side of a pair says what is chosen: navy, not the red of
  // an action.
  const chosen = primary && selected === true;
  const speech = useSpeech();
  const layout = useLayout();
  // At a large text size a mark sits above the words, which then have the button's width.
  const markAbove = mark !== undefined && layout.text !== "default";
  return (
    <Pressable
      testID={testID}
      accessibilityRole={selected === undefined ? "button" : "radio"}
      accessibilityLabel={spoken ?? label}
      accessibilityLanguage={speech}
      accessibilityState={{ disabled, ...(selected !== undefined && { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        chosen && styles.chosen,
        pressed &&
          !disabled &&
          (chosen
            ? styles.chosenPressed
            : primary
              ? styles.primaryPressed
              : styles.secondaryPressed),
        disabled && primary && styles.disabled,
        mark !== undefined && !markAbove && styles.withMark,
        markAbove && styles.markAbove,
      ]}
    >
      {mark}
      <Text
        // Beside a mark the words have less width: never cut short, they take a third line.
        // At the largest text sizes no count is kept: the button grows with its words.
        numberOfLines={layout.text === "huge" ? undefined : mark === undefined ? 2 : 3}
        style={[
          styles.buttonLabel,
          mark !== undefined && !markAbove && styles.labelBesideMark,
          { color: chosen ? color.onAction : primary ? color.onPrimary : color.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Two buttons side by side; at the largest text one above the other, so a word is never
// broken inside itself. A choice between them is a radio group, each side's selected state
// said, as Crew's view switch is; two actions (`choice={false}`) are a plain row.
export function Pair({
  children,
  choice = true,
}: {
  children: ReactNode;
  choice?: boolean;
}) {
  const huge = useLayout().text === "huge";
  return (
    <View
      accessibilityRole={choice ? "radiogroup" : undefined}
      style={huge ? styles.stack : styles.pair}
    >
      {children}
    </View>
  );
}

// One side of a pair: half the row, or the whole width when the pair stacks.
export function Side({ children }: { children: ReactNode }) {
  const huge = useLayout().text === "huge";
  return <View style={huge ? undefined : styles.side}>{children}</View>;
}

export function Screen({
  children,
  testID,
  band,
}: {
  children: ReactNode;
  testID: string;
  // A navy head (ui/band.tsx) that runs up under the clock; the page below keeps clear of it.
  band?: ReactNode;
}) {
  if (band === undefined) {
    return (
      // Inside the safe area: nothing of a screen sits under the clock or the home bar.
      <SafeAreaView
        testID={testID}
        style={styles.screen}
        edges={["top", "left", "right"]}
      >
        {/* Dark on the pale page: a band before it (ui/band.tsx) left the bar's words white. */}
        <StatusBar style="dark" />
        {children}
      </SafeAreaView>
    );
  }
  return (
    <View testID={testID} style={styles.banded}>
      {band}
      <SafeAreaView style={styles.under} edges={["left", "right"]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export const text = StyleSheet.create({
  title: { ...(type.title as TextStyle), color: color.ink },
  heading: { ...(type.heading as TextStyle), color: color.ink },
  body: { ...(type.body as TextStyle), color: color.ink },
  bodyStrong: { ...(type.bodyStrong as TextStyle), color: color.ink },
  secondary: { ...(type.secondary as TextStyle), color: color.inkSecondary },
  label: { ...(type.label as TextStyle), color: color.brandNavy },
  attention: { ...(type.secondary as TextStyle), color: color.attention },
});

const styles = StyleSheet.create({
  // The page is their navy's palest tint, under a navy band where a screen has one.
  screen: {
    flex: 1,
    backgroundColor: color.brandNavyTint,
    padding: space[4],
    gap: space[4],
  },
  banded: { flex: 1, backgroundColor: color.brandNavyTint },
  under: { flex: 1, padding: space[4], gap: space[4] },
  button: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: size.radiusPrimary,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  primary: { minHeight: size.primary, backgroundColor: color.primary },
  primaryPressed: { backgroundColor: color.primaryPressed },
  // The chosen side of a pair: the pair's own height, so its two sides line up.
  chosen: { minHeight: size.target, backgroundColor: color.action },
  chosenPressed: { backgroundColor: color.actionPressed },
  secondaryPressed: { backgroundColor: color.actionTint },
  secondary: {
    minHeight: size.target,
    backgroundColor: color.surface,
    borderWidth: border.hairline,
    borderColor: color.controlBorder,
  },
  disabled: { backgroundColor: color.muted },
  buttonLabel: { ...(type.bodyStrong as TextStyle), textAlign: "center" },
  withMark: { flexDirection: "row", gap: space[3] },
  markAbove: { gap: space[2] },
  // Beside a mark the words give way, wrapping, so the mark keeps its place instead of
  // being pushed against the edge.
  labelBesideMark: { flexShrink: 1 },
  pair: { flexDirection: "row", gap: space[2] },
  stack: { gap: space[2] },
  side: { flex: 1 },
});
