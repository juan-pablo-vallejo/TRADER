// The first of the phone's languages that is one of ours, English when none is; and the
// language a screen reader speaks the app in, the one chosen in it. Apart from the provider
// so they can be tested with nothing of a device beneath them.
import { type Language, LANGUAGES } from "./catalog";

export function preferred(codes: readonly (string | null)[]): Language {
  for (const code of codes) {
    const match = LANGUAGES.find((l) => l === code);
    if (match !== undefined) return match;
  }
  return "en";
}

// A BCP 47 tag, as `accessibilityLanguage` takes it (ui/text.tsx).
export const speechLanguage = (language: Language): string => language;
