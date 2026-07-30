import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the plain-TypeScript modules. Rendering React Native components would
    // need a native-mocking environment, and Phase 0's mobile screen is proven
    // by running it on a simulator rather than by asserting on a fake one.
    include: ["test/**/*.test.ts"],
  },
});
