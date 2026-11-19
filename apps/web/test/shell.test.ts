// The frame every screen sits in: three layouts, and which host's `/` is whose. Read from
// the files themselves where the fact is one of structure: a public page that imported the
// session frame would load Clerk for every visitor.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { officeHost } from "../src/server/environment";
import { isPublicPath, OFFICE_HOME, PUBLIC_PATHS } from "../src/server/sign-in-paths";

const at = (path: string) =>
  fileURLToPath(new URL(`../src/app/${path}`, import.meta.url));
const read = (path: string) => readFileSync(at(path), "utf8");

describe("the three layouts", () => {
  it("keeps Clerk and the query client out of the public pages", () => {
    for (const file of ["(public)/layout.tsx", "(public)/page.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "@clerk|session-frame|providers|useQuery/);
    }
    // The document itself loads neither: each layout beneath it chooses.
    expect(read("layout.tsx")).not.toMatch(/from "@clerk|session-frame|providers/);
  });

  it("writes no inline style on a public page, which its policy would refuse", () => {
    for (const file of ["(public)/layout.tsx", "(public)/page.tsx", "logo.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /style=\{|<Image\b|from "next\/image";\nimport Image/,
      );
      expect(source, file).not.toMatch(/import Image from "next\/image"/);
    }
  });

  it("gives the office and sign-in the session frame, and only the office its menu", () => {
    const office = read("(office)/layout.tsx");
    const auth = read("(auth)/layout.tsx");
    for (const layout of [office, auth]) expect(layout).toContain("<SessionFrame>");
    expect(office).toContain("<Nav />");
    expect(office).toContain("<Header />");
    expect(auth).not.toMatch(/<Nav|<Header/);
  });

  it("puts every office screen in the office's layout", () => {
    for (const screen of [
      "schedule",
      "hours",
      "jobs",
      "customers",
      "invoices",
      "people",
      "profile",
    ]) {
      expect(existsSync(at(`(office)/${screen}/page.tsx`)), screen).toBe(true);
    }
    expect(existsSync(at("(auth)/sign-in/[[...sign-in]]/page.tsx"))).toBe(true);
  });

  it("serves the font from the app itself, with its license beside it", () => {
    expect(existsSync(at("fonts/InterVariable.woff2"))).toBe(true);
    expect(read("fonts/Inter-LICENSE.txt")).toContain("SIL Open Font License");
    expect(read("layout.tsx")).toContain("next/font/local");
  });

  it("orders the menu as a week is worked, with Customers beside Jobs and not in it", () => {
    const nav = read("nav.tsx");
    const order = [...nav.matchAll(/\{ href: "(\/[a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["/schedule", "/hours", "/jobs", "/invoices", "/people"]);
    expect(nav).toContain('also: ["/customers"]');
  });
});

describe("the public pages", () => {
  it("are four exact addresses, and nothing of the office or the API", () => {
    expect([...PUBLIC_PATHS]).toEqual(["/", "/get", "/privacy", "/terms"]);
    for (const path of ["/", "/get", "/get/", "/privacy", "/terms"]) {
      expect([path, isPublicPath(path)]).toEqual([path, true]);
    }
    for (const path of [
      "/schedule",
      "/sign-in",
      "/api/trpc/me.get",
      "/api/ready",
      "/get/more",
      "/terms/../schedule",
      "/Terms",
      "",
    ]) {
      expect([path, isPublicPath(path)]).toEqual([path, false]);
    }
  });

  it("are passed by the proxy before Clerk's middleware is reached", () => {
    const proxy = readFileSync(
      fileURLToPath(new URL("../src/proxy.ts", import.meta.url)),
      "utf8",
    );
    const skip = proxy.indexOf(
      "if (isPublicPath(request.nextUrl.pathname)) return pass(request, null);",
    );
    expect(skip).toBeGreaterThan(0);
    expect(skip).toBeLessThan(proxy.indexOf("return clerkMiddleware("));
  });
});

describe("whose `/` it is", () => {
  it("is the office's only on the host the deployment names", () => {
    const env = { TRADER_OFFICE_HOST: "app.jpteq.app" };
    expect(officeHost(env, "app.jpteq.app")).toBe(true);
    expect(officeHost(env, "APP.JPTEQ.APP")).toBe(true);
    expect(officeHost(env, "jpteq.app")).toBe(false);
    expect(officeHost(env, "www.jpteq.app")).toBe(false);
    expect(officeHost(env, null)).toBe(false);
  });

  it("is the homepage where one host serves both, as on staging", () => {
    for (const env of [{}, { TRADER_OFFICE_HOST: "" }, { TRADER_OFFICE_HOST: "  " }]) {
      expect(officeHost(env, "staging.example")).toBe(false);
      expect(officeHost(env, "")).toBe(false);
    }
  });

  it("sends a signed-in person to the schedule", () => {
    expect(OFFICE_HOME).toBe("/schedule");
  });
});
