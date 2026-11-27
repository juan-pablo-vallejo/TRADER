// The app's one text field: in the app's own font (fonts.ts), never the phone's, and spoken
// in the app's language. Screens take it, not React Native's TextInput; a test holds them
// to it (test/styles.test.ts).
import type { ComponentProps } from "react";
import { StyleSheet, TextInput } from "react-native";

import { fontFile } from "../fonts";
import { useSpeech } from "../i18n";

export function Field({ style, ...props }: ComponentProps<typeof TextInput>) {
  const speech = useSpeech();
  return (
    <TextInput accessibilityLanguage={speech} {...props} style={[style, styles.font]} />
  );
}

const styles = StyleSheet.create({ font: { fontFamily: fontFile("400") } });
