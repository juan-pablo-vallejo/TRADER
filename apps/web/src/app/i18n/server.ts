// The language of this request, for what the server renders itself: the document's
// `lang`, and the few pages that are server components.
import { cookies, headers } from "next/headers";

import { en, type Catalog } from "./en";
import { es } from "./es";
import { chooseLanguage, LANGUAGE_COOKIE, type Language } from "./language";

export const CATALOGS: Record<Language, Catalog> = { en, es };

export async function requestLanguage(): Promise<Language> {
  const [jar, sent] = await Promise.all([cookies(), headers()]);
  return chooseLanguage(jar.get(LANGUAGE_COOKIE)?.value, sent.get("accept-language"));
}

export async function requestStrings(): Promise<{ t: Catalog; language: Language }> {
  const language = await requestLanguage();
  return { t: CATALOGS[language], language };
}
