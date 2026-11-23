// The frame every screen sits in: three layouts, and which host's `/` is whose. Read from
// the files themselves where the fact is one of structure: a public page that imported the
// session frame would load Clerk for every visitor.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { addressFor, listedOrigins } from "../src/server/addresses";
import { isPublicPath, OFFICE_HOME, PUBLIC_PATHS } from "../src/server/sign-in-paths";

const at = (path: string) =>
  fileURLToPath(new URL(`../src/app/${path}`, import.meta.url));
const read = (path: string) => readFileSync(at(path), "utf8");

describe("the three layouts", () => {
  it("keeps Clerk and the query client out of the public pages", () => {
    for (const file of [
      "(public)/layout.tsx",
      "(public)/page.tsx",
      "(public)/site-header.tsx",
      "(public)/gallery.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "@clerk|session-frame|providers|useQuery/);
    }
    // The document itself loads neither: each layout beneath it chooses.
    expect(read("layout.tsx")).not.toMatch(/from "@clerk|session-frame|providers/);
  });

  it("writes no style of its own on a public page: the one inline style is next/image's", () => {
    // A public page's policy admits a `style` attribute, for a photo's blurred stand-in,
    // and nothing else inline (csp.ts, proxy.ts). The pages still write none themselves.
    for (const file of [
      "(public)/layout.tsx",
      "(public)/page.tsx",
      "(public)/site-header.tsx",
      "(public)/gallery.tsx",
      "logo.tsx",
      // Sign-in too: a server with no Clerk keys serves it under the policy that admits
      // no inline style at all, so its two pictures are plain <img> as the logo is.
      "(auth)/sign-in-frame.tsx",
      "(auth)/sign-in/[[...sign-in]]/page.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/style=\{|<style\b|dangerouslySetInnerHTML/);
    }
    for (const file of ["logo.tsx", "(auth)/sign-in-frame.tsx"]) {
      expect(read(file), file).not.toMatch(/<Image\b|import Image from "next\/image"/);
    }
  });

  it("gives the office and sign-in the session frame, and only the office its menu", () => {
    const office = read("(office)/layout.tsx");
    const auth = read("(auth)/layout.tsx");
    for (const layout of [office, auth]) expect(layout).toContain("<SessionFrame>");
    expect(office).toContain("<Nav />");
    expect(office).toContain("<Header />");
    expect(auth).not.toMatch(/<Nav|<Header/);
    // Nor anything of sign-in's own page: this layout is also around the not-found screen
    // /sign-in answers under the development identity, which must not wear its frame.
    expect(auth).not.toMatch(/data-brand|auth\.module|import [^;]*sign-in-frame/);
    expect(read("(auth)/sign-in/[[...sign-in]]/page.tsx")).toContain("<SignInFrame>");
  });

  it("puts every office screen in the office's layout", () => {
    for (const screen of [
      "schedule",
      "hours",
      "jobs",
      "customers",
      "invoices",
      "people",
      "today",
      "settings",
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
    // D'Sierra's two, Bodoni Moda and Inter's Latin cut: files of the app's own at fixed
    // addresses, their licenses kept, declared in one sheet that only the homepage and
    // sign-in import, and each of those asks for its headline's itself. Not next/font,
    // whose preloads this build puts on every route.
    const web = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
    for (const file of ["BodoniModa-latin-5.3.0.woff2", "Inter-latin-5.3.0.woff2"]) {
      expect(existsSync(web(`public/fonts/${file}`)), file).toBe(true);
      expect(read("brand-fonts.css")).toContain(`url("/fonts/${file}")`);
    }
    const importers = ["(public)/page.tsx", "(auth)/sign-in-frame.tsx"];
    for (const file of importers) {
      expect(read(file), file).toContain('import "../brand-fonts.css";');
      expect(read(file), file).toContain(
        'const HEADING_FONT = "/fonts/BodoniModa-latin-5.3.0.woff2";',
      );
      expect(read(file), file).toContain("preload(HEADING_FONT,");
      expect(read(file), file).not.toMatch(/from "next\/font/);
    }
    for (const file of [
      "layout.tsx",
      "(office)/layout.tsx",
      "(public)/layout.tsx",
      "(auth)/layout.tsx",
    ]) {
      expect(read(file), file).not.toContain("brand-fonts.css");
    }
    expect(read("fonts/BodoniModa-LICENSE.txt")).toContain("SIL Open Font License");
    expect(read("(public)/layout.tsx")).not.toMatch(/from "next\/font/);
    // The office's Inter is every script it draws, 352 KB: no page is made to fetch it
    // before its own text asks.
    expect(read("layout.tsx")).toContain("preload: false");
    expect(read("(public)/home.module.css")).toContain("font-family: var(--font-home);");
    expect(read("(auth)/auth.module.css")).toContain("font-family: var(--font-home);");
    expect(read("(auth)/sign-in-frame.tsx")).toContain("data-brand");
    // And nothing beside either page's root inherits the office's face and fetches it.
    expect(read("theme.css")).toMatch(
      /html:has\(\[data-brand\]\) \{\s*font-family: system-ui, sans-serif;/,
    );
  });

  it("opens the menu on Today, then as a week is worked, with Customers beside Jobs", () => {
    const nav = read("nav.tsx");
    const order = [...nav.matchAll(/\{ href: "(\/[a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      "/today",
      "/schedule",
      "/hours",
      "/jobs",
      "/invoices",
      "/people",
    ]);
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
    // And theirs is the policy that admits a `style` attribute, by the same list.
    expect(proxy).toContain("styleAttributes: isPublicPath(request.nextUrl.pathname),");
  });
});

describe("which address a page is served at", () => {
  const PRODUCTION = {
    CLERK_AUTHORIZED_PARTIES: "https://app.jpteq.app,https://dsierrapainting.jpteq.app",
    TRADER_HOME_HOST: "dsierrapainting.jpteq.app",
  };
  const at = (
    env: Record<string, string | undefined>,
    host: string | null,
    path: string,
  ) => {
    const [pathname = "/", query] = path.split("?");
    return addressFor(env, {
      host,
      pathname,
      search: query === undefined ? "" : `?${query}`,
    });
  };
  const SERVE = { kind: "serve" };
  const to = (where: string) => ({ kind: "redirect", to: where });

  it("the home host: `/` is the homepage, and everything else answers as anywhere", () => {
    const home = "dsierrapainting.jpteq.app";
    for (const path of [
      "/",
      "/get",
      "/sign-in",
      "/schedule",
      "/hours?range=last",
      "/privacy",
    ]) {
      expect([path, at(PRODUCTION, home, path)]).toEqual([path, SERVE]);
    }
    // However the browser spelled the host.
    expect(at(PRODUCTION, "DSierraPainting.JPTEQ.app", "/")).toEqual(SERVE);
    expect(at(PRODUCTION, "dsierrapainting.jpteq.app.", "/")).toEqual(SERVE);
  });

  it("the neutral host: `/` goes to the office, and everything else is served", () => {
    const neutral = "app.jpteq.app";
    expect(at(PRODUCTION, neutral, "/")).toEqual(to("/today"));
    for (const path of ["/get", "/sign-in", "/schedule", "/invoices/abc", "/terms"]) {
      expect([path, at(PRODUCTION, neutral, path)]).toEqual([path, SERVE]);
    }
  });

  it("an unlisted host: a page goes to the same path on the first listed origin", () => {
    const stray = "trader-abc123.vercel.app";
    expect(at(PRODUCTION, stray, "/schedule")).toEqual(
      to("https://app.jpteq.app/schedule"),
    );
    expect(at(PRODUCTION, stray, "/hours?range=last&flagged=1")).toEqual(
      to("https://app.jpteq.app/hours?range=last&flagged=1"),
    );
    expect(at(PRODUCTION, stray, "/")).toEqual(to("https://app.jpteq.app/"));
    expect(at(PRODUCTION, "www.jpteq.app", "/sign-in")).toEqual(
      to("https://app.jpteq.app/sign-in"),
    );
    // Sent on, it is then the neutral host's own `/`: two steps, never a loop.
    expect(at(PRODUCTION, "app.jpteq.app", "/")).toEqual(to("/today"));
    expect(at(PRODUCTION, "app.jpteq.app", "/schedule")).toEqual(SERVE);
  });

  it("never moves the API: the phone and the readiness check name a host of their own", () => {
    for (const path of ["/api/ready", "/api/trpc/sync.pull", "/api", "/trpc/x"]) {
      expect([path, at(PRODUCTION, "trader-abc123.vercel.app", path)]).toEqual([
        path,
        SERVE,
      ]);
    }
  });

  it("no variable at all: `/` stays the homepage on whatever host asked", () => {
    for (const env of [{}, { TRADER_HOME_HOST: "" }, { TRADER_HOME_HOST: "  " }]) {
      for (const host of ["localhost:3000", "staging.example", "anything.at.all"]) {
        expect(at(env, host, "/")).toEqual(SERVE);
        expect(at(env, host, "/schedule")).toEqual(SERVE);
      }
    }
    // Staging: its one origin listed, no home host. `/` is the homepage there.
    const staging = { CLERK_AUTHORIZED_PARTIES: "https://staging.example" };
    expect(at(staging, "staging.example", "/")).toEqual(SERVE);
    expect(at(staging, "old.example", "/get")).toEqual(to("https://staging.example/get"));
  });

  it("reads only origins from the list, and serves when a request names no host", () => {
    expect(
      listedOrigins({
        CLERK_AUTHORIZED_PARTIES:
          " https://a.example , not a url,https://b.example/path ",
      }).map((o) => o.origin),
    ).toEqual(["https://a.example"]);
    expect(at(PRODUCTION, null, "/schedule")).toEqual(SERVE);
    expect(at(PRODUCTION, "", "/")).toEqual(SERVE);
    // A port is part of a host: a local server on another port is not the listed one.
    const local = { CLERK_AUTHORIZED_PARTIES: "http://localhost:3000" };
    expect(at(local, "localhost:3000", "/schedule")).toEqual(SERVE);
    expect(at(local, "localhost:4000", "/schedule")).toEqual(
      to("http://localhost:3000/schedule"),
    );
  });

  it("is carried out by the proxy before Clerk or the page", () => {
    const proxy = readFileSync(
      fileURLToPath(new URL("../src/proxy.ts", import.meta.url)),
      "utf8",
    );
    const decided = proxy.indexOf("const address = addressFor(");
    expect(decided).toBeGreaterThan(0);
    expect(decided).toBeLessThan(proxy.indexOf("return clerkMiddleware("));
    expect(decided).toBeLessThan(proxy.indexOf("if (isPublicPath("));
  });

  it("sends a signed-in person to Today", () => {
    expect(OFFICE_HOME).toBe("/today");
  });
});
