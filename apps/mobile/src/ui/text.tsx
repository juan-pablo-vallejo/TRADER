// The app's one Text: React Native's, in the app's own font, spoken by a screen reader in the
// language chosen in the app, so Spanish words are not read with an English voice.
// `accessibilityLanguage` is iOS's (React Native's View and Text props); Android's TalkBack
// reads with the phone's own voice. Every screen imports Text from here; a test holds them to
// it.
//
// The font is Inter, shipped in the app one file per weight (fonts.ts), never the phone's:
// a maker's system font without a face for the weight asked (Motorola's has no 600) has
// Android measure a line in one face and draw it in a wider fake bold, and the line's end is
// cut. A style's weight picks Inter's file for it and is then cleared, so nothing is faked.
import type { ComponentProps } from "react";
import { Text as NativeText, StyleSheet, type TextStyle } from "react-native";

import { fontFor } from "../fonts";
import { useSpeech } from "../i18n";
import { grows, type } from "../theme";

// A heading grows with the phone's text size to twice its size at most (theme.ts, grows),
// unless the text says its own limit.
export function Text({
  style,
  maxFontSizeMultiplier,
  ...props
}: ComponentProps<typeof NativeText>) {
  const speech = useSpeech();
  const flat = fontFor(StyleSheet.flatten(style) as TextStyle | undefined);
  const heading = (flat.fontSize ?? 0) >= type.heading.fontSize;
  return (
    <NativeText
      accessibilityLanguage={speech}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? (heading ? grows.heading : undefined)
      }
      {...props}
      style={flat}
    />
  );
}
