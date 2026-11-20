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

// Words that are the same in both languages on purpose: the product's name, and each
// language's own name for itself, shown where the language is chosen.
const SAME = new Set(["appName", "settings.english", "settings.spanish"]);

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
