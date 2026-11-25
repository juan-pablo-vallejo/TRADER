// The i18n layer: the language the phone is set to when it is
// English or Spanish, English otherwise, and whatever the person then chooses in Settings.
// The choice is kept in the device's store, so it is still made the next time the app
// opens. Screens read `useStrings()` and never hold a string of their own.
import { getLocales } from "expo-localization";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { deviceStore } from "../store/device";

import { type Catalog, type Language, LANGUAGES } from "./catalog";
import { en } from "./en";
import { preferred, speechLanguage } from "./preferred";
import { es } from "./es";

const CATALOGS: Record<Language, Catalog> = { en, es };
const KEY = "language";

type Value = { language: Language; setLanguage: (l: Language) => void; t: Catalog };
const Strings = createContext<Value | null>(null);

export function StringsProvider({ children }: { children: ReactNode }) {
  const [language, setChosen] = useState<Language>(() =>
    preferred(getLocales().map((l) => l.languageCode)),
  );
  useEffect(() => {
    void deviceStore.read(KEY).then((kept) => {
      const match = LANGUAGES.find((l) => l === kept);
      if (match !== undefined) setChosen(match);
    });
  }, []);
  const setLanguage = useCallback((next: Language) => {
    setChosen(next);
    void deviceStore.write(KEY, next);
  }, []);
  const value = useMemo(
    () => ({ language, setLanguage, t: CATALOGS[language] }),
    [language, setLanguage],
  );
  return <Strings.Provider value={value}>{children}</Strings.Provider>;
}

export function useStrings(): Value {
  const value = useContext(Strings);
  if (value === null) throw new Error("useStrings needs StringsProvider above it");
  return value;
}

// The language a screen reader speaks a text or a control in: the one chosen in the app.
// Undefined outside the provider (the build that was not told its API), where the phone's
// own is used.
export function useSpeech(): string | undefined {
  const value = useContext(Strings);
  return value === null ? undefined : speechLanguage(value.language);
}
