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
import { type ComponentProps, useState } from "react";
import { Text as NativeText, StyleSheet, type TextStyle } from "react-native";

import { fontFor } from "../fonts";
import { useSpeech } from "../i18n";
import { grows, type } from "../theme";

// Text grows with the phone's text size to its role's limit (theme.ts, grows): a heading to
// twice its size, everything else to 2.3 times, unless the text says its own limit.
//
// In a development build a text held to a number of lines that cuts its words short says
// so: "-truncated" on its test id, which the layout sweep's check reads
// (.maestro/check-hierarchy.mjs). A release build does not watch.
export function Text({
  style,
  maxFontSizeMultiplier,
  testID,
  onTextLayout,
  ...props
}: ComponentProps<typeof NativeText>) {
  const speech = useSpeech();
  const [cut, setCut] = useState(false);
  const flat = fontFor(StyleSheet.flatten(style) as TextStyle | undefined);
  const heading = (flat.fontSize ?? 0) >= type.heading.fontSize;
  const words = typeof props.children === "string" ? props.children : null;
  const lines = props.numberOfLines;
  const watch = __DEV__ && lines !== undefined && words !== null;
  return (
    <NativeText
      accessibilityLanguage={speech}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? (heading ? grows.heading : grows.body)
      }
      {...props}
      testID={cut ? `${testID ?? "text"}-truncated` : testID}
      onTextLayout={
        watch
          ? (event) => {
              // The words on the lines shown, against all of them, spaces aside.
              const shown = event.nativeEvent.lines
                .slice(0, lines)
                .map((line) => line.text)
                .join("");
              const bare = (t: string) => t.replace(/\s/g, "").length;
              setCut(bare(shown) < bare(words));
              onTextLayout?.(event);
            }
          : onTextLayout
      }
      style={flat}
    />
  );
}
