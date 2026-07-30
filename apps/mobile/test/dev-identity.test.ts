import { describe, expect, it } from "vitest";

import { DEV_SUBJECTS, DEV_SUBJECT_HEADER } from "../src/dev-identity";

/**
 * These pin the client half of a two-sided fact. The server half is
 * `DEV_SUBJECT_HEADER` in `apps/web/src/server/auth.ts`, and
 * `apps/web/test/auth.test.ts` pins the identical literal — a header the two
 * sides spell differently does not error, it silently produces a 401 that looks
 * like "not signed in". Change one and you must change the other.
 */
describe("development identity", () => {
  it("sends the subject in the header the web edge reads", () => {
    expect(DEV_SUBJECT_HEADER).toBe("x-trader-dev-subject");
  });

  it("is lowercase, because header names are matched case-insensitively but compared raw", () => {
    expect(DEV_SUBJECT_HEADER).toBe(DEV_SUBJECT_HEADER.toLowerCase());
  });

  /**
   * `dev_admin` is the id `pnpm db:seed` promotes via SEED_ADMIN_CLERK_USER_ID.
   * `dev_worker_1` deliberately has no seeded row — it exercises just-in-time
   * provisioning, and must come back as a `worker`.
   */
  it("offers a seeded admin and an unseeded worker", () => {
    expect(DEV_SUBJECTS).toContain("dev_admin");
    expect(DEV_SUBJECTS).toContain("dev_worker_1");
  });
});
