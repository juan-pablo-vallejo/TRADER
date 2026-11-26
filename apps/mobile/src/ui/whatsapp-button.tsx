// A control that opens a WhatsApp chat, drawn with WhatsApp's own inline logo (glyph and
// wordmark) from its brand resources, the official file scaled and otherwise unchanged
// (Meta's WhatsApp brand page, read 2026-11-26). The button around it is ours: white, the
// control's navy edge, a full target tall. A screen reader hears the control's words.
import { Image, Pressable, StyleSheet } from "react-native";

import { useSpeech } from "../i18n";
import { color, size, space } from "../theme";

// The logo's own proportions: 1487 by 346.
const HEIGHT = 22;
const WIDTH = Math.round((HEIGHT * 1487.13) / 346);
// eslint-disable-next-line @typescript-eslint/no-require-imports -- React Native's way to name a bundled image
const LOGO = require("../../assets/whatsapp-inline-green.png") as number;

export function WhatsAppButton({
  testID,
  spoken,
  onPress,
}: {
  testID: string;
  spoken: string;
  onPress: () => void;
}) {
  const speech = useSpeech();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityLanguage={speech}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.target,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[4],
    borderRadius: size.radiusCard,
    borderWidth: 1,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
  },
  pressed: { backgroundColor: color.actionTint },
  logo: { width: WIDTH, height: HEIGHT },
});
