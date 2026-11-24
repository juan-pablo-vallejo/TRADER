// One grouping for the whole API (core/group.ts, M13): each key's rows in their input order,
// keys in the order first seen. Pushed, never copied: grouping a worker's whole history was
// quadratic at five sites.
import { expect, it } from "vitest";

import { groupBy } from "../../src/core/group";

it("groups rows by key, in input order, keys as first seen", () => {
  const rows = [
    { w: "b", n: 1 },
    { w: "a", n: 2 },
    { w: "b", n: 3 },
  ];
  const groups = groupBy(rows, (r) => r.w);
  expect([...groups.keys()]).toEqual(["b", "a"]);
  expect(groups.get("b")!.map((r) => r.n)).toEqual([1, 3]);
  expect(groups.get("a")!.map((r) => r.n)).toEqual([2]);
  expect(groupBy([], (r: { w: string }) => r.w).size).toBe(0);
});

it("groups a long history in linear time", () => {
  const rows = Array.from({ length: 200_000 }, (_, n) => ({ w: `w${n % 10}`, n }));
  const started = performance.now();
  const groups = groupBy(rows, (r) => r.w);
  expect(performance.now() - started).toBeLessThan(500);
  expect(groups.get("w3")!).toHaveLength(20_000);
});
