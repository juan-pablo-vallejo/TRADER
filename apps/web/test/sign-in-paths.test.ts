// The addresses the sign-in page builds and reads (src/server/sign-in-paths.ts): the link
// from a screen of the office that remembers where the person was, the reading of it back,
// and the way to the homepage. And what the page itself must stay.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { homeHref, returnPath, signInFrom } from "../src/server/sign-in-paths";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/app/${path}`, import.meta.url)), "utf8");

// What is not a path of this origin, however it is dressed.
const ELSEWHERE = [
  "",
  "hours",
  "//evil.example/hours",
  "/\\evil.example",
  "https://evil.example/hours",
  "javascript:alert(1)",
  "/hours\n",
  "/hours\u0000",
  "/sign-in",
  "/sign-in/sso-callback",
  "/sign-in?redirect_url=%2Fhours",
];

describe("the sign-in link from a screen of the office", () => {
  it("carries where the person was", () => {
    expect(signInFrom("/hours?range=last&flagged=1")).toBe(
      "/sign-in?redirect_url=%2Fhours%3Frange%3Dlast%26flagged%3D1",
    );
    expect(signInFrom("/invoices/abc")).toBe("/sign-in?redirect_url=%2Finvoices%2Fabc");
  });

  it("is the plain link for Today, and for anything that is not a path here", () => {
    for (const path of ["/today", ...ELSEWHERE]) {
      expect([path, signInFrom(path)]).toEqual([path, "/sign-in"]);
    }
  });
});

describe("where the sign-in page sends a person once they are in", () => {
  it("is where the link said, read back whole", () => {
    for (const path of ["/hours?range=last&flagged=1", "/invoices/abc", "/today"]) {
      const link = new URL(signInFrom(path), "https://office.example");
      expect([
        path,
        returnPath(link.searchParams.get("redirect_url") ?? undefined),
      ]).toEqual([path, path]);
    }
  });

  it("is Today for no address, two of them, and anything that is not a path here", () => {
    expect(returnPath(undefined)).toBe("/today");
    expect(returnPath(["/hours", "/jobs"])).toBe("/today");
    for (const value of ELSEWHERE) {
      expect([value, returnPath(value)]).toEqual([value, "/today"]);
    }
  });
});

describe("the way back to the homepage from sign-in", () => {
  it("is the home host where a deployment names one, however it is spelled", () => {
    for (const host of [
      "dsierrapainting.jpteq.app",
      " DSierraPainting.JPTEQ.app ",
      "dsierrapainting.jpteq.app.",
    ]) {
      expect([host, homeHref({ TRADER_HOME_HOST: host })]).toEqual([
        host,
        "https://dsierrapainting.jpteq.app/",
      ]);
    }
  });

  it("is `/` where none is named, or where the name is not a host", () => {
    for (const host of [
      undefined,
      "",
      "  ",
      "localhost",
      "https://dsierrapainting.jpteq.app",
      "dsierrapainting.jpteq.app/path",
      "a b.example",
      "evil.example@jpteq.app",
      "-bad.example",
    ]) {
      expect([host, homeHref({ TRADER_HOME_HOST: host })]).toEqual([host, "/"]);
    }
  });
});

describe("the sign-in form", () => {
  const form = read("(auth)/sign-in/sign-in-form.tsx");
  const page = read("(auth)/sign-in/page.tsx");

  it("is the office's own, and never offers or asks for a sign-up", () => {
    // Clerk's prebuilt form cannot take a number and an email in one field. And nobody
    // signs up: a login exists only because the office made it.
    for (const source of [form, page]) {
      expect(source).not.toMatch(
        /<SignIn\b|<SignUp\b|useSignUp|signUp\b|signUpIfMissing/,
      );
    }
    expect(form).toContain('from "@clerk/nextjs"');
    expect(form).toContain("useSignIn()");
  });

  it("reads what was typed, and a refusal, by the functions the phone shares", () => {
    for (const shared of ["signInIdentifier", "signInFailure", "signInCode"]) {
      expect([shared, form.includes(shared)]).toEqual([shared, true]);
    }
    expect(form).toContain('from "@trader/api/contract"');
  });

  it("takes the texted code from the keyboard, in one field", () => {
    expect(form).toContain('autoComplete="one-time-code"');
    expect(form).toContain('inputMode="numeric"');
  });

  it("sends a signed-in visitor on from the server, to where the link said", () => {
    const sentOn = page.indexOf("redirect(returnTo)");
    expect(sentOn).toBeGreaterThan(0);
    expect(sentOn).toBeLessThan(page.indexOf("<SignInForm"));
    // And the 404 under the development identity comes before anything else.
    expect(page.indexOf("notFound()")).toBeLessThan(page.indexOf("await auth()"));
  });
});
