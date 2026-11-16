// The first of the phone's languages that is one of ours, English when none is. Apart from
// the provider so it can be tested with nothing of a device beneath it.
import { type Language, LANGUAGES } from "./catalog";

export function preferred(codes: readonly (string | null)[]): Language {
  for (const code of codes) {
    const match = LANGUAGES.find((l) => l === code);
    if (match !== undefined) return match;
  }
  return "en";
}
