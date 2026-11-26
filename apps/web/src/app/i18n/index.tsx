"use client";

// The office's language as every client component reads it: the catalog, the language,
// the formatters bound to it, and the way to change it. The server chose the language for
// the first paint (server.ts) and hands it in; a change is kept in the cookie the server
// reads, set on the document so a screen reader pronounces it right, and the page's server
// parts are asked for again in the new language. There is no fallback: a catalog is whole
// or it does not compile.
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { formatters, type Formatters } from "../format";
import { en, type Catalog } from "./en";
import { es } from "./es";
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, type Language } from "./language";

const CATALOGS: Record<Language, Catalog> = { en, es };

type Value = {
  t: Catalog;
  language: Language;
  f: Formatters;
  setLanguage: (next: Language) => void;
};

const LanguageContext = createContext<Value | null>(null);

export function LanguageProvider({
  language: initial,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  const [language, setChosen] = useState<Language>(initial);
  const router = useRouter();
  const setLanguage = useCallback(
    (next: Language) => {
      document.cookie = `${LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`;
      document.documentElement.lang = next;
      // The page is drawn again in the new language, and the focus would fall to its top:
      // the control that changed it keeps it (by its id, or, for a language switch, which
      // of the page's switches it was).
      const active = document.activeElement;
      const id = active instanceof HTMLElement ? active.id : "";
      const switches = [...document.querySelectorAll("[data-language-switch]")];
      const at = active === null ? -1 : switches.indexOf(active);
      const back = () => {
        const now = document.activeElement;
        if (now !== null && now !== document.body) return;
        const target =
          id !== ""
            ? document.getElementById(id)
            : at >= 0
              ? document.querySelectorAll<HTMLElement>("[data-language-switch]")[at]
              : null;
        target?.focus();
      };
      for (const wait of [50, 300, 1000]) window.setTimeout(back, wait);
      setChosen(next);
      router.refresh();
    },
    [router],
  );
  const value = useMemo(
    () => ({
      t: CATALOGS[language],
      language,
      f: formatters(language, CATALOGS[language]),
      setLanguage,
    }),
    [language, setLanguage],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useStrings(): Value {
  const value = useContext(LanguageContext);
  if (value === null) throw new Error("useStrings is read inside LanguageProvider");
  return value;
}
