import { afterEach, describe, expect, it, vi } from "vitest";

import { DEV_SUBJECT_HEADER, devAuthEnabled } from "../src/server/auth";

/**
 * The development identity path is the one piece of this app that, misconfigured,
 * hands an admin session to anyone who asks. These four cases are its whole
 * contract, and each was watched to fail before being written: disarming
 * `devAuthEnabled` makes a production server with no flag set return a signed-in
 * admin from `me.get`.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * The server half of a two-sided fact. `apps/mobile/src/dev-identity.ts` pins the
 * identical literal, and `apps/mobile/test/dev-identity.test.ts` asserts it — a
 * header the two sides spell differently does not error, it silently produces a
 * 401 that reads as "not signed in". Change one and you must change the other.
 */
it("reads the subject from the header the mobile client sends", () => {
  expect(DEV_SUBJECT_HEADER).toBe("x-trader-dev-subject");
});

describe("devAuthEnabled", () => {
  it("is off when the flag is absent", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_AUTH_ENABLED", undefined);
    expect(devAuthEnabled()).toBe(false);
  });

  it("is on only for the exact string 'true'", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of ["1", "yes", "TRUE", "", "false"]) {
      vi.stubEnv("DEV_AUTH_ENABLED", value);
      expect(devAuthEnabled(), `DEV_AUTH_ENABLED=${value}`).toBe(false);
    }
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    expect(devAuthEnabled()).toBe(true);
  });

  /**
   * `next build` runs with NODE_ENV=production and no dev flag. If this threw
   * rather than returning false, the build would fail — and the tempting fix,
   * setting the flag in CI, is precisely what must never become habitual.
   */
  it("stays quiet during a production build, so `next build` needs no auth env", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_ENABLED", undefined);
    expect(() => devAuthEnabled()).not.toThrow();
    expect(devAuthEnabled()).toBe(false);
  });

  it("throws when the flag is set in production — the one dangerous combination", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_AUTH_ENABLED", "true");
    expect(() => devAuthEnabled()).toThrow(/production build/i);
  });
});
