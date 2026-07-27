import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These exercise the real middleware chain and the real JIT insert against
    // Postgres — the behaviour under test is transactional, not pure.
    include: ["test/**/*.test.ts"],
    // Shared fixture rows make parallel files race; this suite is small.
    fileParallelism: false,
  },
});
