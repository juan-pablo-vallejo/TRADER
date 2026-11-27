// A screen's head: D'Sierra's navy, from under the clock down past the title, as Sign in's
// band and their homepage's header are. The title is white, in Bodoni Moda; what sits beside
// it (the sync chip) and under it (the screen's main fact, as Today's clock) is the screen's.
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { StyleSheet, type TextStyle, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLayout } from "../layout";
import { color, grows, space, type } from "../theme";
import { Text } from "./text";

export function Band({
  title,
  beside,
  children,
}: {
  title: string;
  beside?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // At the largest text the band keeps only its title: the screen shows its main fact on
  // the page, where it scrolls, and the band does not fill the screen.
  const huge = useLayout().text === "huge";
  return (
    <View style={[styles.band, { paddingTop: insets.top + space[3] }]}>
      <StatusBar style="light" />
      <View style={styles.row}>
        <Text
          style={styles.title}
          accessibilityRole="header"
          maxFontSizeMultiplier={grows.display}
        >
          {title}
        </Text>
        {beside}
      </View>
      {!huge && children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    gap: space[3],
    paddingHorizontal: space[4],
    paddingBottom: space[4],
    backgroundColor: color.brandNavy,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  title: { ...(type.display as TextStyle), color: color.onAction, flexShrink: 1 },
});
