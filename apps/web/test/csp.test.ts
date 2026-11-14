// Release 0.1 R3: the content security policy as a string (server/csp.ts). What a browser
// makes of it is checked on the deployment (TASKS, Stage 6, edge line).
import { describe, expect, it } from "vitest";

import { clerkFrontendApi, contentSecurityPolicy, createNonce } from "../src/server/csp";

const key = (host: string, kind = "test") => `pk_${kind}_${btoa(`${host}$`)}`;
const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );

describe("clerkFrontendApi", () => {
  it("reads the host Clerk encodes in a publishable key", () => {
    expect(clerkFrontendApi(key("valid-name-12.clerk.accounts.dev"))).toBe(
      "valid-name-12.clerk.accounts.dev",
    );
    expect(clerkFrontendApi(key("clerk.example.test", "live"))).toBe(
      "clerk.example.test",
    );
  });

  it.each([
    ["no prefix", btoa("clerk.example.test$")],
    ["not base64", "pk_test_%%%"],
    ["no closing mark", `pk_test_${btoa("clerk.example.test")}`],
    ["a path", key("clerk.example.test/evil")],
    ["a second source", key("clerk.example.test https://evil.test")],
    ["a directive", key("clerk.example.test; script-src *")],
    ["a bare word", key("localhost")],
    ["empty", ""],
  ])("refuses a key with %s", (_, value) => {
    expect(clerkFrontendApi(value)).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  const withClerk = directives(
    contentSecurityPolicy({ nonce: "N0nce==", clerkFrontendApi: "x.clerk.accounts.dev" }),
  );
  const without = directives(
    contentSecurityPolicy({ nonce: "N0nce==", clerkFrontendApi: null }),
  );

  it("runs only this origin's script, by nonce, and what that script loads", () => {
    expect(without["script-src"]).toEqual([
      "'self'",
      "'nonce-N0nce=='",
      "'strict-dynamic'",
    ]);
    expect(withClerk["script-src"]).toEqual([
      "'self'",
      "'nonce-N0nce=='",
      "'strict-dynamic'",
      "https://x.clerk.accounts.dev",
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ]);
    for (const policy of [withClerk, without]) {
      expect(policy["script-src"]).not.toContain("'unsafe-inline'");
      expect(policy["script-src"]).not.toContain("'unsafe-eval'");
    }
  });

  it("admits nothing beyond this origin where Clerk is not the identity", () => {
    expect(without).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'nonce-N0nce=='", "'strict-dynamic'"],
      "style-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "frame-src": ["'none'"],
      "worker-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("admits Clerk's hosts as its page lists them, and no other", () => {
    expect(withClerk["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(withClerk["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://img.clerk.com",
    ]);
    expect(withClerk["connect-src"]).toEqual([
      "'self'",
      "https://x.clerk.accounts.dev",
      "https://*.protect.clerk.com:*",
    ]);
    expect(withClerk["frame-src"]).toEqual([
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ]);
    expect(withClerk["worker-src"]).toEqual(["'self'", "blob:"]);
    for (const name of [
      "default-src",
      "font-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ]) {
      expect(withClerk[name]).toEqual(without[name]);
    }
  });
});

describe("createNonce", () => {
  it("makes 128 bits of base64, new each time", () => {
    const made = new Set(Array.from({ length: 50 }, createNonce));
    expect(made.size).toBe(50);
    for (const nonce of made) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});
