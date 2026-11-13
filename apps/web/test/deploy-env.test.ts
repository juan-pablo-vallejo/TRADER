// Release 0.1 R3: the environment a deployment may start with (deploy-env.ts), and the
// start-up hook that enforces it (instrumentation.ts). Pure: no database, no network.
import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "../src/instrumentation";
import { assertDeployEnv, deployEnvFaults, sentryDsn } from "../src/server/deploy-env";

// Shaped like the real values; none is one.
const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://trader_app:pw@db.example.test/neondb?sslmode=require",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
  CLERK_AUTHORIZED_PARTIES: "https://staging.example.test",
  SENTRY_DSN: "https://0123456789abcdef@o1.ingest.example.test/42",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("deployEnvFaults", () => {
  it("accepts a complete environment, the optional variables blank or set", () => {
    expect(deployEnvFaults(good)).toEqual([]);
    expect(
      deployEnvFaults({
        ...good,
        DATABASE_POOL_MAX: "3",
        TRADER_DEV_IDENTITY: "",
        TRADER_SYNC_MODE: "read_only",
        TRADER_MIN_BUILD_IOS: "12",
        TRADER_MIN_BUILD_ANDROID: "",
      }),
    ).toEqual([]);
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: "" }],
    ["DATABASE_URL", { DATABASE_URL: undefined }],
    ["DATABASE_URL", { DATABASE_URL: "db.example.test/neondb" }],
    ["DATABASE_URL", { DATABASE_URL: "https://db.example.test/neondb" }],
    ["DATABASE_POOL_MAX", { DATABASE_POOL_MAX: "0" }],
    ["DATABASE_DRIVER", { DATABASE_DRIVER: "neon" }],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" }],
    ["CLERK_SECRET_KEY", { CLERK_SECRET_KEY: "pk_test_abc" }],
    ["CLERK_AUTHORIZED_PARTIES", { CLERK_AUTHORIZED_PARTIES: "" }],
    ["CLERK_AUTHORIZED_PARTIES", { CLERK_AUTHORIZED_PARTIES: undefined }],
    ["CLERK_AUTHORIZED_PARTIES", { CLERK_AUTHORIZED_PARTIES: "staging.example.test/" }],
    ["TRADER_DEV_IDENTITY", { TRADER_DEV_IDENTITY: "enabled" }],
    ["TRADER_DEV_IDENTITY", { TRADER_DEV_IDENTITY: "off" }],
    ["TRADER_SYNC_MODE", { TRADER_SYNC_MODE: "pause" }],
    ["TRADER_MIN_BUILD_IOS", { TRADER_MIN_BUILD_IOS: "0" }],
    ["TRADER_MIN_BUILD_ANDROID", { TRADER_MIN_BUILD_ANDROID: "v2" }],
    ["SENTRY_DSN", { SENTRY_DSN: "" }],
    ["SENTRY_DSN", { SENTRY_DSN: undefined }],
  ])("names %s and nothing else", (name, change) => {
    expect(deployEnvFaults({ ...good, ...change })).toEqual([name]);
  });

  it("names every fault at once, each once, and no value", () => {
    const faults = deployEnvFaults({
      NODE_ENV: "production",
      CLERK_SECRET_KEY: "sk_test_leak-me",
      TRADER_SYNC_MODE: "leak-me-too",
    });
    expect(faults).toEqual([
      "DATABASE_URL",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_AUTHORIZED_PARTIES",
      "TRADER_SYNC_MODE",
      "SENTRY_DSN",
    ]);
    expect(() => assertDeployEnv({ DATABASE_URL: "postgres://u:leak-me@h/d" })).toThrow(
      /^refusing to start: missing or invalid [A-Z_, ]+$/,
    );
  });
});

describe("sentryDsn", () => {
  it.each([
    "http://0123456789abcdef@o1.ingest.example.test/42",
    "https://o1.ingest.example.test/42",
    "https://key:secret@o1.ingest.example.test/42",
    "https://key@o1.ingest.example.test/",
    "https://key@o1.ingest.example.test/42/extra",
    "https://key@o1.ingest.example.test/42?x=1",
    "not a url",
  ])("refuses %s", (value) => {
    expect(sentryDsn({ SENTRY_DSN: value })).toBeNull();
  });

  it("returns a well-formed address as given", () => {
    expect(sentryDsn(good)).toBe(good.SENTRY_DSN);
  });
});

describe("register", () => {
  const stub = (env: Record<string, string | undefined>) => {
    for (const name of [
      ...Object.keys(good),
      "TRADER_DEV_IDENTITY",
      "TRADER_SYNC_MODE",
    ]) {
      vi.stubEnv(name, env[name] ?? "");
    }
  };

  it("refuses to start a production server with a variable missing, naming it", async () => {
    stub({ ...good, SENTRY_DSN: "" });
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(register()).rejects.toThrow(
      "refusing to start: missing or invalid SENTRY_DSN",
    );
    expect(log).toHaveBeenCalledWith("refusing to start: missing or invalid SENTRY_DSN");
  });

  it("starts a production server whose environment is complete", async () => {
    stub(good);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await expect(register()).resolves.toBeUndefined();
  });

  it("checks nothing in development, under test, or outside the Node runtime", async () => {
    stub({ NODE_ENV: "development" });
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    await expect(register()).resolves.toBeUndefined();
    stub({ NODE_ENV: "test" });
    await expect(register()).resolves.toBeUndefined();
    stub({ NODE_ENV: "production" });
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await expect(register()).resolves.toBeUndefined();
  });
});
