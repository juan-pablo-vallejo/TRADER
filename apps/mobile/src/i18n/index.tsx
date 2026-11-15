// The i18n layer (RULES; DESIGN, Localization): the language the phone is set to when it is
// English or Spanish, English otherwise, and whatever the person then chooses in Settings.
// The choice lives in memory in this build; the device's store keeps it once there is one
// (TASKS R5). Screens read `useStrings()` and never hold a string of their own.
import { getLocales } from "expo-localization";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { type Catalog, type Language, LANGUAGES } from "./catalog";
import { en } from "./en";
import { es } from "./es";

const CATALOGS: Record<Language, Catalog> = { en, es };

// The first of the phone's languages that is one of ours.
export function preferred(codes: readonly (string | null)[]): Language {
  for (const code of codes) {
    const match = LANGUAGES.find((l) => l === code);
    if (match !== undefined) return match;
  }
  return "en";
}

type Value = { language: Language; setLanguage: (l: Language) => void; t: Catalog };
const Strings = createContext<Value | null>(null);

export function StringsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() =>
    preferred(getLocales().map((l) => l.languageCode)),
  );
  const value = useMemo(
    () => ({ language, setLanguage, t: CATALOGS[language] }),
    [language],
  );
  return <Strings.Provider value={value}>{children}</Strings.Provider>;
}

export function useStrings(): Value {
  const value = useContext(Strings);
  if (value === null) throw new Error("useStrings needs StringsProvider above it");
  return value;
}
