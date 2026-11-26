// The app's fonts: Inter, the office's, shipped in the app one file per weight, and the
// sign-in heading's Bodoni Moda, all loaded before the first screen (app/_layout.tsx). A style names a weight; `fontFor` gives it the
// file for that weight and clears the weight, so no phone draws a fake bold it did not
// measure (ui/text.tsx). A weight with no file here takes the nearest heavier one.
import { BodoniModa_700Bold } from "@expo-google-fonts/bodoni-moda";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import type { TextStyle } from "react-native";

export const FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  BodoniModa_700Bold,
};

export type FontFile = keyof typeof FONTS;

const BY_WEIGHT: Record<string, FontFile> = {
  normal: "Inter_400Regular",
  "100": "Inter_400Regular",
  "200": "Inter_400Regular",
  "300": "Inter_400Regular",
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  bold: "Inter_700Bold",
  "700": "Inter_700Bold",
  "800": "Inter_700Bold",
  "900": "Inter_700Bold",
};

// The file for a weight: what a text field or a library's label names directly.
export const fontFile = (weight: TextStyle["fontWeight"] = "400"): FontFile =>
  BY_WEIGHT[String(weight)] ?? "Inter_400Regular";

// A style in the app's font. One that already names a family (the headings' Bodoni Moda) is
// left as it is.
export function fontFor(style: TextStyle | undefined): TextStyle {
  const flat = style ?? {};
  if (flat.fontFamily !== undefined) return flat;
  return { ...flat, fontFamily: fontFile(flat.fontWeight), fontWeight: "normal" };
}
