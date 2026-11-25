// The workers' two catalogs (every string they see in English and Spanish). The
// compiler already holds both to one shape; this holds what it cannot: that no entry is
// left blank, that a Spanish entry is not the English one left untranslated, and that a
// sentence built from a name carries the name in both.
import { describe, expect, it } from "vitest";

import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

type Leaf = string | ((...args: never[]) => string);
type Tree = { [key: string]: Leaf | Tree };

function leaves(tree: Tree, path = ""): [string, Leaf][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object"
      ? leaves(value, `${path}${key}.`)
      : [[`${path}${key}`, value] as [string, Leaf]],
  );
}

const said = (leaf: Leaf) =>
  typeof leaf === "string" ? leaf : (leaf as (name: string) => string)("Ana Ruiz");

// Words that are the same in both languages on purpose: the product's name, each
// language's own name for itself, shown where the language is chosen, and Apple's names
// for an iPhone's lock, which are not translated.
const SAME = new Set([
  "appName",
  "me.english",
  "me.spanish",
  "biometric.names.faceId",
  "biometric.names.touchId",
]);

describe("the catalogs", () => {
  const english = leaves(en as unknown as Tree);
  const spanish = new Map(leaves(es as unknown as Tree));

  it("have the same entries", () => {
    expect([...spanish.keys()].sort()).toEqual(english.map(([key]) => key).sort());
  });

  it("leave nothing blank, and translate everything that is not a name", () => {
    for (const [key, leaf] of english) {
      const other = spanish.get(key)!;
      expect([key, said(leaf).trim() !== ""]).toEqual([key, true]);
      expect([key, said(other).trim() !== ""]).toEqual([key, true]);
      expect([key, said(leaf) === said(other)]).toEqual([key, SAME.has(key)]);
    }
  });

  it("carry a name through a sentence built from one", () => {
    expect(en.today.clockInAt("Elm St porch")).toContain("Elm St porch");
    expect(es.today.clockInAt("Elm St porch")).toContain("Elm St porch");
  });
});

// Every wording a leaf can produce: with names in its blanks, and with one and with many.
const wordings = (leaf: Leaf) =>
  typeof leaf === "string"
    ? [leaf]
    : [
        ["Ana Ruiz", "B", "C"],
        [1, 1, 1],
        [2, 2, 2],
      ].map((args) => (leaf as (...args: unknown[]) => string)(...args));

// A whole word or phrase, whatever its letters: JavaScript's \b ends a word at an accent.
const word = (alternatives: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, "iu");

// Words the phone no longer shows: the office's list (apps/web/test/i18n.test.ts) but for
// the work session, which only the office leaves unnamed, and the phone's own: a shift
// reminder is a "recordatorio", a flag stays an "aviso". "jobsite" stays only in a sentence
// about a place.
const RETIRED = {
  both: [
    word("roster|repair\\p{L}*|ledger|plantilla"),
    word("attendance|asistencia|employees?|edited|editad[oa]|editó|fix|profile|perfil"),
  ],
  en: [
    word("\\p{L}+n't|(?:we|you|they|it|that|there)'(?:ll|re|ve|d|s)"),
    word("your office"),
  ],
  es: [
    word("entrar|entra|entrando|entrada marcada|tu oficina|activados|desactivados"),
    word("avisos|avisarte"),
    /^(Sí|No)(:|$)/,
  ],
};
const PLACE = word("location|away from|standing at");

describe("the phone's words", () => {
  it("leave out every retired word, in both languages", () => {
    const found: string[] = [];
    for (const [language, catalog] of [
      ["en", en],
      ["es", es],
    ] as const) {
      const rules = [...RETIRED.both, ...RETIRED[language]];
      for (const [key, leaf] of leaves(catalog as unknown as Tree)) {
        for (const text of wordings(leaf)) {
          for (const rule of rules) {
            if (rule.test(text)) found.push(`${language} ${key}: ${text}`);
          }
          if (word("jobsites?").test(text) && !PLACE.test(text)) {
            found.push(`${language} ${key}: ${text}`);
          }
        }
      }
    }
    expect([...new Set(found)]).toEqual([]);
  });
});
