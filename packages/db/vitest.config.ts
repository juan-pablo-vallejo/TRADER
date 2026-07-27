import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These tests assert database behaviour (triggers, column types), so they
    // talk to real Postgres rather than a mock. A trigger cannot be unit-tested.
    include: ["test/**/*.test.ts"],
    // Shared fixture rows make parallel files race; this suite is small.
    fileParallelism: false,
  },
});
