// TASKS:43: development sign-in fails closed — 404 wherever the development identity is off —
// and, where it is on, sets one cookie that the identity seam bridges to the api adapter.
// Signing in twice with the same email binds once: the subject is derived from the email.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as trpc } from "../src/app/api/trpc/[trpc]/route";
import { GET, POST } from "../src/app/dev-signin/route";
import { getDb } from "../src/server/db";
import { DEV_EMAIL_COOKIE, devSubjectFor } from "../src/server/identity";
import { invitation, ownerDb, query } from "./helpers";

const owner = ownerDb();
let fixture: Awaited<ReturnType<typeof invitation>>;

beforeEach(async () => {
  fixture = await invitation(owner);
});
afterEach(async () => {
  await fixture.cleanup();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await getDb().$client.end();
  await owner.$client.end();
});

const post = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return POST(
    new Request("http://test/dev-signin", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
};

// What a browser would send back from a Set-Cookie: the name=value pair alone.
const cookieOf = (response: Response) =>
  response.headers.get("set-cookie")!.split(";")[0]!;

describe("/dev-signin", () => {
  it("answers 404 to GET and POST when the development identity is off", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    expect((await GET()).status).toBe(404);
    expect((await post({ email: fixture.email })).status).toBe(404);
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET()).status).toBe(404);
    expect((await post({ email: fixture.email })).status).toBe(404);
  });

  it("serves the form when on, uncached", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).toContain('name="email"');
  });

  it("sets the cookie on sign-in, clears it on sign-out, refuses a bad email", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const signedIn = await post({ email: fixture.email });
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get("location")).toBe("http://test/");
    const set = signedIn.headers.get("set-cookie")!;
    expect(set).toContain(`${DEV_EMAIL_COOKIE}=${encodeURIComponent(fixture.email)}`);
    for (const attribute of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) {
      expect(set).toContain(attribute);
    }
    const signedOut = await post({ intent: "signout" });
    expect(signedOut.status).toBe(303);
    expect(signedOut.headers.get("set-cookie")).toContain(`${DEV_EMAIL_COOKIE}=; `);
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await post({ email: "not an email" })).status).toBe(400);
  });

  it("signs the same email in twice: 200 both times, one users row, one subject", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    for (const _ of [1, 2]) {
      const cookie = cookieOf(await post({ email: fixture.email }));
      const r = await query(trpc, "me.get", { headers: { cookie } });
      expect(r.status).toBe(200);
      expect(r.body.result?.data.json).toMatchObject({ id: fixture.userId });
    }
    const rows = await owner
      .select({ identitySubject: users.identitySubject })
      .from(users)
      .where(eq(users.email, fixture.email));
    expect(rows).toEqual([{ identitySubject: devSubjectFor(fixture.email) }]);
  });

  it("is ignored by the api when the cookie is present but the identity is off", async () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    const cookie = cookieOf(await post({ email: fixture.email }));
    vi.stubEnv("TRADER_DEV_IDENTITY", "");
    const r = await query(trpc, "me.get", { headers: { cookie } });
    expect(r.status).toBe(401);
  });
});
