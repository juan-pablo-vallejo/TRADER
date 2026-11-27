import { expect, it } from "vitest";

// A throwaway red test: CI's `check` must turn red when `test` does.
it("fails on purpose", () => {
  expect(1).toBe(2);
});
