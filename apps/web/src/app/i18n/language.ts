// The office's two languages, and how one is chosen with nothing but the request: the
// person's own choice, kept in a cookie so the first paint is already right, else the
// browser's language, else English. No server code and no React: the proxy, the layout and
// the browser all read this one module.
export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

// Not a session and not a secret: one word, read by the server to render the page.
export const LANGUAGE_COOKIE = "trader_lang";
// A year: a choice made once is not asked for again.
export const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const isLanguage = (value: string | undefined | null): value is Language =>
  LANGUAGES.includes(value as Language);

// The first language the browser asks for that the office has, by its `q` order:
// `es-MX,es;q=0.9,en;q=0.8` is Spanish. A header that names neither is nobody's choice.
export function fromAcceptLanguage(header: string | null | undefined): Language | null {
  if (header === null || header === undefined) return null;
  const asked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      const weight = q === undefined ? 1 : Number(q);
      return { tag: tag.trim().toLowerCase(), weight, index };
    })
    .filter((a) => a.tag !== "" && Number.isFinite(a.weight) && a.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of asked) {
    const primary = tag.split("-")[0];
    if (isLanguage(primary)) return primary;
  }
  return null;
}

export function chooseLanguage(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Language {
  return isLanguage(cookie) ? cookie : (fromAcceptLanguage(acceptLanguage) ?? "en");
}

// The locale dates and money are written in: the language, in the United States, where
// the contractor works. Spanish keeps the dollar sign and the decimal point of a US check.
export const localeOf = (language: Language): string =>
  language === "es" ? "es-US" : "en-US";
