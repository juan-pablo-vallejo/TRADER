"use client";

// The other language, under its own name: on the public pages, where there is no header
// menu to hold it. Marked as that language, so someone who cannot read this page finds
// theirs and a screen reader says it right. It looks like the office's text action unless
// the page that holds it says otherwise: the homepage's header and footer are navy, where
// the office's indigo cannot be read.
import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import { LANGUAGES } from "./i18n/language";

export function LanguageSwitch({ className }: { className?: string }) {
  const { t, language, setLanguage } = useStrings();
  return (
    <>
      {LANGUAGES.filter((l) => l !== language).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          data-language-switch
          className={className ?? controls.textAction}
          onClick={() => setLanguage(l)}
        >
          {t.languages[l]}
        </button>
      ))}
    </>
  );
}
