// The office's two catalogs and the choice between them. The compiler already holds both
// catalogs to one shape (i18n/en.ts); this holds what it cannot: that no entry is blank,
// that a Spanish entry is not the English one left untranslated, that a sentence built
// from a name carries it in both, and that the language is chosen from the cookie, else
// the browser, else English.
import { describe, expect, it } from "vitest";

import { formatters } from "../src/app/format";
import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";
import { chooseLanguage, fromAcceptLanguage, localeOf } from "../src/app/i18n/language";

type Leaf = string | ((...args: never[]) => string);
type Tree = { [key: string]: Leaf | Tree };

function leaves(tree: Tree, path = ""): [string, Leaf][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object"
      ? leaves(value, `${path}${key}.`)
      : [[`${path}${key}`, value] as [string, Leaf]],
  );
}

// A sentence as it reads with something in every blank: a name, and a number that is not 1.
const said = (leaf: Leaf) =>
  typeof leaf === "string"
    ? leaf
    : (leaf as (...args: unknown[]) => string)("Ana Ruiz", "B", "C", "D");
const counted = (leaf: Leaf, n: number) =>
  typeof leaf === "string" ? leaf : (leaf as (n: number) => string)(n);

// The same in both languages on purpose: the product's name, each language under its own
// name, a dash for nothing, an id's label, and patterns that are only their blanks.
const SAME = new Set([
  "languages.en",
  "languages.es",
  "dayOf",
  "duration",
  "hoursValue",
  "schedule.weekOf",
  "schedule.openShift",
  "invoices.total",
  "invoices.subtotal",
  "invoices.forCustomer",
  "invoices.paymentLine",
  "invoices.hoursOf",
  "invoices.laborOn",
]);

describe("the office's catalogs", () => {
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

  it("say one and many, in both", () => {
    for (const catalog of [en, es]) {
      expect(counted(catalog.schedule.people, 1)).not.toBe(
        counted(catalog.schedule.people, 2),
      );
      expect(catalog.schedule.added(1)).toContain("1");
      expect(catalog.schedule.added(3)).toContain("3");
      expect(catalog.week.exportOpen(1)).toContain("1");
      expect(catalog.week.exportFlagged(4)).toContain("4");
      expect(catalog.jobsUnarchived(2)).toContain("2");
    }
  });

  it("carry a name through a sentence built from one", () => {
    for (const catalog of [en, es]) {
      expect(catalog.deactivatePersonEffect("Ana Ruiz")).toContain("Ana Ruiz");
      expect(catalog.schedule.removeEffect("Ana Ruiz", "Elm St", "Mon")).toContain(
        "Elm St",
      );
      expect(catalog.invoices.issueEffect("$1,250.00")).toContain("$1,250.00");
    }
  });
});

describe("the language a page is drawn in", () => {
  it("is the person's own choice when they made one", () => {
    expect(chooseLanguage("es", "en-US,en;q=0.9")).toBe("es");
    expect(chooseLanguage("en", "es-MX,es;q=0.9")).toBe("en");
  });

  it("starts from the browser's language", () => {
    expect(chooseLanguage(undefined, "es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(chooseLanguage(undefined, "en-US,en;q=0.9,es;q=0.8")).toBe("en");
    // By weight, not by the order written.
    expect(chooseLanguage(undefined, "en;q=0.5, es;q=0.9")).toBe("es");
    expect(fromAcceptLanguage("fr-CA, es-419;q=0.8, en;q=0.7")).toBe("es");
    // Refused outright is not asked for.
    expect(fromAcceptLanguage("es;q=0, en;q=0.1")).toBe("en");
  });

  it("is English when neither says, or says something the office does not have", () => {
    expect(chooseLanguage(undefined, undefined)).toBe("en");
    expect(chooseLanguage(null, "fr-FR,de;q=0.8")).toBe("en");
    expect(chooseLanguage("fr", null)).toBe("en");
    expect(chooseLanguage("", "")).toBe("en");
    expect(chooseLanguage("ES", "es")).toBe("es");
  });
});

describe("dates and money in each language", () => {
  const inEnglish = formatters("en", en);
  const inSpanish = formatters("es", es);

  it("write a day in the language", () => {
    expect(inEnglish.day("2026-11-16")).toBe("Nov 16, 2026");
    expect(inSpanish.day("2026-11-16")).toMatch(/16 .*nov.* 2026/);
    expect(inEnglish.weekDay("2026-11-16")).toBe("Mon, Nov 16");
    expect(inSpanish.weekDay("2026-11-16")).toMatch(/^lun/);
  });

  it("write dollars as a United States check does, in either", () => {
    expect(localeOf("es")).toBe("es-US");
    expect(inEnglish.money(125050, "USD")).toBe("$1,250.50");
    expect(inSpanish.money(125050, "USD")).toMatch(/1,250\.50/);
  });

  it("write a length of time from the catalog", () => {
    expect(inEnglish.duration(7 * 3_600_000 + 5 * 60_000)).toBe("7 h 05 min");
    expect(inSpanish.duration(7 * 3_600_000 + 5 * 60_000)).toBe("7 h 05 min");
  });
});
