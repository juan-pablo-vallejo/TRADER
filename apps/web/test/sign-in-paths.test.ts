// The addresses the sign-in page builds and reads (src/server/sign-in-paths.ts): the link
// from a screen of the office that remembers where the person was, the reading of it back,
// and the way to the homepage. And what the page itself must stay.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";
import {
  homeHref,
  returnPath,
  signInFrom,
  signInRefused,
  ssoCallbackFrom,
} from "../src/server/sign-in-paths";

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
  const back = read("(auth)/sign-in/sso-callback/sso-callback.tsx");
  const backPage = read("(auth)/sign-in/sso-callback/page.tsx");
  // What a file does, without what its comments say about what it does not.
  const code = (source: string) =>
    source.replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("is the office's own, and never offers or asks for a sign-up", () => {
    // Clerk's prebuilt form cannot take a number and an email in one field. And nobody
    // signs up: a login exists only because the office made it.
    for (const source of [form, page, back, backPage]) {
      expect(code(source)).not.toMatch(
        /<SignIn\b|<SignUp\b|useSignUp|signUp\b|signUpIfMissing|HandleSSOCallback|transfer/,
      );
    }
    expect(form).toContain('from "@clerk/nextjs"');
    expect(form).toContain("useSignIn()");
  });

  it("offers Google in Google's own style, with nothing of Google's fetched", () => {
    // A sheet of its own: these colors are Google's, and the page's sheet does not
    // reach for them.
    const sheet = read("(auth)/sign-in/google-button.module.css");
    expect(read("(auth)/auth.module.css")).not.toContain(".google");
    expect(read("(auth)/auth.module.css")).not.toContain("--google-");
    const rule = sheet.slice(sheet.indexOf(".google {"), sheet.indexOf(".google img"));
    // Google's light button (Google's branding page, read 2026-11-23), held in theme.css's
    // `--google-*` tokens.
    const theme = read("theme.css");
    for (const token of [
      "--google-surface: #ffffff;",
      "--google-edge: #747775;",
      "--google-ink: #1f1f1f;",
      "--google-text: 14px;",
      "--google-text-line: 20px;",
      "--google-end: 12px;",
      "--google-gap: 10px;",
      "--google-mark: 20px;",
    ]) {
      expect([token, theme.includes(token)]).toEqual([token, true]);
    }
    for (const part of [
      "background: var(--google-surface);",
      "box-shadow: inset 0 0 0 var(--hairline) var(--google-edge);",
      "color: var(--google-ink);",
      "gap: var(--google-gap);",
      "padding: 0 var(--google-end);",
      '500 var(--google-text) / var(--google-text-line) "Google Sans"',
      // As tall as the page's own button: no less prominent.
      "min-height: var(--home-control);",
    ]) {
      expect([part, rule.includes(part)]).toEqual([part, true]);
    }
    // Its mark is Google's own, cut from Google's button and served from here, at its
    // own 20 px; its words are Google's, in each language.
    const mark = readFileSync(
      fileURLToPath(new URL("../public/google-g.svg", import.meta.url)),
      "utf8",
    );
    expect(mark).toMatch(/^<svg width="20" height="20" viewBox="10 10 20 20"/);
    expect(mark).not.toMatch(/https?:\/\/(?!www\.w3\.org\/)/);
    expect(form).toContain('<img src="/google-g.svg" alt="" width={20} height={20} />');
    expect(form).toContain('strategy: "oauth_google"');
    // A sign-in the passkey offer already started stops Clerk going to Google: set aside.
    const google = form.slice(
      form.indexOf("const withGoogle"),
      form.indexOf("signIn.sso("),
    );
    expect(google).toContain("await signIn.reset();");
    for (const source of [form, back, sheet]) {
      expect(code(source)).not.toMatch(/google\.com|gstatic|googleapis/);
    }
    expect([en.signInForm.google, es.signInForm.google]).toEqual([
      "Continue with Google",
      "Continuar con Google",
    ]);
  });

  it("brings a person back from Google to where they were going, or to be told", () => {
    expect(ssoCallbackFrom("/today")).toBe("/sign-in/sso-callback");
    expect(ssoCallbackFrom("/hours?week=2026-11-16")).toBe(
      "/sign-in/sso-callback?redirect_url=%2Fhours%3Fweek%3D2026-11-16",
    );
    expect(signInRefused("/today")).toBe("/sign-in?refused=google");
    expect(signInRefused("/people")).toBe(
      "/sign-in?refused=google&redirect_url=%2Fpeople",
    );
    // Whatever a link said, only a path of the office is carried on.
    for (const elsewhere of ["https://evil.example/", "//evil.example", "/sign-in"]) {
      expect(ssoCallbackFrom(elsewhere)).toBe("/sign-in/sso-callback");
      expect(signInRefused(elsewhere)).toBe("/sign-in?refused=google");
    }
    // A return that failed for any other reason than an unknown account says so.
    expect(signInRefused("/today", false)).toBe("/sign-in?refused=google-failed");
    // The callback finishes a sign-in that is complete, takes up a session Clerk has,
    // and otherwise sends the person back: three ways out and no fourth.
    expect(back).toContain('signIn.status === "complete"');
    expect(back).toContain("signIn.existingSession?.sessionId");
    expect(back).toContain("signInRefused(returnTo, signIn.isTransferable)");
    // And the page is no page where sign-in is none.
    expect(backPage.indexOf("notFound()")).toBeGreaterThan(0);
    expect(backPage.indexOf("notFound()")).toBeLessThan(
      backPage.indexOf("searchParams)."),
    );
  });

  it("reads what was typed, and a refusal, by the functions the phone shares", () => {
    for (const shared of ["signInIdentifier", "signInFailure", "signInCode"]) {
      expect([shared, form.includes(shared)]).toEqual([shared, true]);
    }
    expect(form).toContain('from "@trader/api/contract"');
  });

  it("leaves the address field's value to the browser, so one typed before the script arrived stays", () => {
    // A field whose value React holds is emptied as React takes the page over.
    const field = form.slice(
      form.indexOf('id="sign-in-address"'),
      form.indexOf("{problem}"),
    );
    expect(field).toContain("defaultValue={typed}");
    expect(field).not.toMatch(/\bvalue=\{/);
    expect(form).toContain('address.current?.value ?? ""');
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
