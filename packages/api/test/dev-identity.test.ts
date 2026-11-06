// Stage 3 line 1b: the development identity adapter. Off by default, on only under an
// allowlisted NODE_ENV, refusing loudly anywhere else.
import { describe, expect, it } from "vitest";

import {
  createDevIdentityAdapter,
  DEV_EMAIL_HEADER,
  DEV_SUBJECT_HEADER,
  devIdentityEnabled,
} from "../src/dev-identity";

const headers = (subject?: string, email?: string) => {
  const h = new Headers();
  if (subject !== undefined) h.set(DEV_SUBJECT_HEADER, subject);
  if (email !== undefined) h.set(DEV_EMAIL_HEADER, email);
  return h;
};

const signedIn = headers("dev-sub", "dev@co.test");

describe("development identity adapter", () => {
  it("is off when the flag is unset or blank", async () => {
    for (const TRADER_DEV_IDENTITY of [undefined, ""]) {
      const adapter = createDevIdentityAdapter({
        NODE_ENV: "development",
        TRADER_DEV_IDENTITY,
      });
      expect(await adapter.identify(signedIn)).toBeNull();
    }
  });

  it("rejects any flag value but 'enabled'", async () => {
    const adapter = createDevIdentityAdapter({
      NODE_ENV: "test",
      TRADER_DEV_IDENTITY: "true",
    });
    await expect(adapter.identify(signedIn)).rejects.toThrow();
  });

  it("returns the headers as a verified identity under development and test", async () => {
    for (const NODE_ENV of ["development", "test"]) {
      const adapter = createDevIdentityAdapter({
        NODE_ENV,
        TRADER_DEV_IDENTITY: "enabled",
      });
      expect(await adapter.identify(headers(" dev-sub ", "dev@co.test"))).toEqual({
        subject: "dev-sub",
        email: "dev@co.test",
        emailVerified: true,
      });
    }
  });

  it("refuses when enabled under production, any other NODE_ENV, or none", async () => {
    for (const NODE_ENV of ["production", "staging", undefined]) {
      const adapter = createDevIdentityAdapter({
        NODE_ENV,
        TRADER_DEV_IDENTITY: "enabled",
      });
      await expect(adapter.identify(signedIn)).rejects.toThrow(
        /refusing the development identity/,
      );
    }
  });

  it("returns null for a missing or invalid header", async () => {
    const adapter = createDevIdentityAdapter({
      NODE_ENV: "test",
      TRADER_DEV_IDENTITY: "enabled",
    });
    for (const h of [
      headers(),
      headers("dev-sub"),
      headers(undefined, "dev@co.test"),
      headers("  ", "dev@co.test"),
      headers("dev-sub", "not-an-email"),
    ]) {
      expect(await adapter.identify(h)).toBeNull();
    }
  });
});

// Stage 4 line 1: the one predicate a route uses to answer 404 instead of serving. True only
// where `identify` would trust the headers; never throws, so a wrongly enabled deployment
// answers 404 from its routes and refuses from its adapter.
describe("devIdentityEnabled", () => {
  it("is true only when enabled under development or test", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(devIdentityEnabled({ NODE_ENV, TRADER_DEV_IDENTITY: "enabled" })).toBe(true);
      expect(devIdentityEnabled({ NODE_ENV, TRADER_DEV_IDENTITY: "" })).toBe(false);
      expect(devIdentityEnabled({ NODE_ENV })).toBe(false);
    }
  });

  it("is false, and does not throw, when enabled under any other NODE_ENV", () => {
    for (const NODE_ENV of ["production", "staging", undefined]) {
      expect(devIdentityEnabled({ NODE_ENV, TRADER_DEV_IDENTITY: "enabled" })).toBe(
        false,
      );
    }
    expect(
      devIdentityEnabled({ NODE_ENV: "development", TRADER_DEV_IDENTITY: "true" }),
    ).toBe(false);
  });
});
