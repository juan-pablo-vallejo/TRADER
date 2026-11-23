// The words the sign-in page gives Clerk's own form (src/app/i18n/clerk-words.ts), and the
// two addresses the page builds for itself (src/server/sign-in-paths.ts).
import { enUS, esMX } from "@clerk/localizations";
import { describe, expect, it } from "vitest";

import { clerkOverrides, clerkWords, laidOver } from "../src/app/i18n/clerk-words";
import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";
import { homeHref, signInFrom } from "../src/server/sign-in-paths";

type Tree = { [key: string]: unknown };
const paths = (tree: Tree, at = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? paths(value as Tree, `${at}${key}.`)
      : [`${at}${key}`],
  );
const pick = (tree: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);

describe("the office's words on Clerk's form", () => {
  it("sit under keys Clerk itself still has", () => {
    // A key Clerk renamed would be accepted and never shown. Each one here is a sentence
    // in Clerk's own English, or, for an error Clerk's English leaves to its server, in
    // its own Spanish.
    for (const path of paths(clerkOverrides(en) as Tree)) {
      const theirs = pick(enUS, path) ?? pick(esMX, path);
      expect([path, typeof theirs]).toEqual([path, "string"]);
    }
  });

  it("are a sentence each, and never the main button's label", () => {
    for (const catalog of [en, es]) {
      const ours = clerkOverrides(catalog) as Tree;
      for (const path of paths(ours)) {
        expect([path, String(pick(ours, path)).trim() !== ""]).toEqual([path, true]);
      }
      // One label for every step of every Clerk form: "Send me a code" would also be the
      // code step's button.
      expect(pick(ours, "formButtonPrimary")).toBeUndefined();
    }
  });

  it("keep a blank Clerk fills in where Clerk's own sentence had one", () => {
    for (const catalog of [en, es]) {
      const methods = clerkOverrides(catalog).signIn?.alternativeMethods;
      expect(methods?.blockButton__phoneCode).toContain("{{identifier}}");
      expect(methods?.blockButton__emailCode).toContain("{{identifier}}");
    }
  });

  it("say the page's heading, in each language", () => {
    expect(pick(clerkWords("en", en), "signIn.start.title")).toBe("Team sign-in");
    expect(pick(clerkWords("es", es), "signIn.start.title")).toBe("Acceso del equipo");
  });

  it("lay over Clerk's Spanish without losing a sentence of it", () => {
    const spanish = clerkWords("es", es) as Tree;
    const ours = new Set(paths(clerkOverrides(es) as Tree));
    const theirs = paths(esMX as Tree).filter((path) => !ours.has(path));
    expect(theirs.length).toBeGreaterThan(500);
    for (const path of theirs) {
      expect([path, pick(spanish, path)]).toEqual([path, pick(esMX, path)]);
    }
    // Ours where we named one, theirs beside it.
    expect(pick(spanish, "signIn.start.subtitle")).toBe(es.signInForm.helper);
    expect(pick(spanish, "signIn.start.actionLink__use_passkey")).toBe(
      pick(esMX, "signIn.start.actionLink__use_passkey"),
    );
    // English is only ours: Clerk lays it over its own default.
    expect(paths(clerkWords("en", en) as Tree).sort()).toEqual(
      paths(clerkOverrides(en) as Tree).sort(),
    );
    // And the laying-over changes neither of its two sides.
    const base = { a: { b: "1", c: "2" } };
    expect(laidOver(base, { a: { c: "3" } })).toEqual({ a: { b: "1", c: "3" } });
    expect(base).toEqual({ a: { b: "1", c: "2" } });
  });
});

describe("the sign-in link from a screen of the office", () => {
  it("carries where the person was, as Clerk's redirect_url", () => {
    expect(signInFrom("/hours?range=last&flagged=1")).toBe(
      "/sign-in?redirect_url=%2Fhours%3Frange%3Dlast%26flagged%3D1",
    );
    expect(signInFrom("/invoices/abc")).toBe("/sign-in?redirect_url=%2Finvoices%2Fabc");
  });

  it("is the plain link for Today, for sign-in itself, and for anything not a path here", () => {
    for (const path of [
      "/today",
      "/sign-in",
      "/sign-in/factor-one",
      "/sign-in?redirect_url=%2Fhours",
      "",
      "hours",
      "//evil.example/hours",
      "/\\evil.example",
      "https://evil.example/hours",
      "/hours\n",
      "/hours\u0000",
    ]) {
      expect([path, signInFrom(path)]).toEqual([path, "/sign-in"]);
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
