// The API's timing headers (server/environment.ts answersTimings): answered on staging and on a
// development machine, never on production, and never by a production build that names no
// environment or misspells it.
import { expect, it } from "vitest";

import { answersTimings } from "../src/server/environment";

it("answers timings on staging and in development only, failing closed", () => {
  const prod = { NODE_ENV: "production" };
  expect(answersTimings({ ...prod, TRADER_ENVIRONMENT: "staging" })).toBe(true);
  expect(answersTimings({ ...prod, TRADER_ENVIRONMENT: "production" })).toBe(false);
  expect(answersTimings(prod)).toBe(false);
  expect(answersTimings({ ...prod, TRADER_ENVIRONMENT: "Staging " })).toBe(false);
  expect(answersTimings({ NODE_ENV: "development" })).toBe(true);
  expect(answersTimings({ NODE_ENV: "test" })).toBe(true);
});
