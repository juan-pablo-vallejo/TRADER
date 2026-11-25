// No module of the four packages imports itself through another: a cycle loads one side
// half-built, and a value read at load time is then undefined. Every relative import counts,
// a type-only one too: it costs nothing to keep the graph a tree, and a type import turned
// into a value import must not be what makes a cycle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const SOURCES = [
  "packages/api/src",
  "packages/db/src",
  "apps/web/src",
  "apps/mobile/src",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = normalize(join(dirname(from), spec));
  return (
    [
      `${base}.ts`,
      `${base}.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
      base,
    ].find(isFile) ?? null
  );
}

// Each file's relative imports and re-exports, as files.
function graphOf(source: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of files(join(ROOT, source))) {
    const text = readFileSync(file, "utf8");
    const specs = [
      ...text.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gms),
    ].map((m) => m[1]!);
    graph.set(
      file,
      specs.map((s) => resolve(file, s)).filter((f): f is string => f !== null),
    );
  }
  return graph;
}

// Strongly connected components of two or more files, by Tarjan's algorithm.
function cycles(graph: Map<string, string[]>): string[][] {
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (v: string) => {
    index.set(v, next);
    low.set(v, next);
    next += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found;
}

describe("the module graph", () => {
  for (const source of SOURCES) {
    it(`has no import cycle in ${source}`, () => {
      const graph = graphOf(source);
      expect(graph.size).toBeGreaterThan(10);
      expect(cycles(graph).map((c) => c.map((f) => relative(ROOT, f)))).toEqual([]);
    });
  }

  it("finds a cycle when there is one", () => {
    const graph = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
      ["d", ["a"]],
    ]);
    expect(cycles(graph)).toEqual([["a", "b", "c"]]);
  });
});
