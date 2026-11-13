// TASKS, R2: the office sign-in route exists only where Clerk is this server's identity. Under
// the development identity it is the not-found screen, as /dev-signin is everywhere else
// (clerk-identity.test.ts): a server offers one way in, never both. The page's other two
// states draw JSX, which this suite does not render; they are checked in the browser.
import { afterEach, describe, expect, it, vi } from "vitest";

import SignInPage from "../src/app/sign-in/[[...sign-in]]/page";

afterEach(() => {
  vi.unstubAllEnvs();
});

// What Next's notFound() throws; the framework turns it into the 404 screen.
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/;

describe("/sign-in", () => {
  it("is not found under the development identity", () => {
    vi.stubEnv("TRADER_DEV_IDENTITY", "enabled");
    expect(() => SignInPage()).toThrow(NOT_FOUND);
  });
});
