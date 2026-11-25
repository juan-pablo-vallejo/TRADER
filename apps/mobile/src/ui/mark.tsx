// D'Sierra's mark, above sign-in: their roller and brush, the app's own icon, from its one
// home in assets/brand. Decoration: a screen reader is told the screen's title, not this.
import { Image, StyleSheet } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- React Native's way to name a bundled image
const icon = require("../../../../assets/brand/icon.png") as number;

export function Mark() {
  return (
    <Image
      source={icon}
      style={styles.mark}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  mark: { width: 72, height: 72, borderRadius: 16, alignSelf: "center" },
});
