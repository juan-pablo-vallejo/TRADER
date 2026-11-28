// How a screen fits the phone it is on, from the window alone: never which phone it is.
//
// Width: `compact` under 360 points (a small Android, an iPhone SE at zoom), `regular`, and
// `wide` from 420. Text: from the phone's text size, `default`, `large` from 1.3 times, and
// `huge` from 1.8 times (iOS's accessibility sizes, Android's largest). A screen asks the
// class, and the shared pieces answer it: at `large` rows wrap and a mark sits above its
// words; at `huge` everything stacks, the navy band keeps only its title, the foot's buttons
// scroll with the page, and no line count is capped.
import { useWindowDimensions } from "react-native";

export type WidthClass = "compact" | "regular" | "wide";
export type TextClass = "default" | "large" | "huge";

export const widthClass = (width: number): WidthClass =>
  width < 360 ? "compact" : width >= 420 ? "wide" : "regular";

export const textClass = (fontScale: number): TextClass =>
  fontScale >= 1.8 ? "huge" : fontScale >= 1.3 ? "large" : "default";

export function useLayout(): { width: WidthClass; text: TextClass } {
  const { width, fontScale } = useWindowDimensions();
  return { width: widthClass(width), text: textClass(fontScale) };
}

// A word split across two lines: a line that ends in a letter, and the next that begins
// with one. A break at a space leaves the space on the line before, and one at a hyphen
// leaves the hyphen, so neither is a split. The letters are English's and Spanish's.
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const ENDS = new RegExp(`[${LETTER}]$`);
const BEGINS = new RegExp(`^[${LETTER}]`);
export const brokenWord = (lines: readonly string[]): boolean =>
  lines.some(
    (line, i) => i + 1 < lines.length && ENDS.test(line) && BEGINS.test(lines[i + 1]!),
  );
