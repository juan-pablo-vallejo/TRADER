// The identity adapter seam at the HTTP edge (RULES: three thin seams): Clerk's adapter
// (clerk-identity.ts), or the development adapter where identity-mode.ts admits it;
// packages/api never sees a token.
import {
  createDevIdentityAdapter,
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
  reportFailure,
  type IdentityAdapter,
} from "@trader/api";

import { clerkEnv } from "./clerk-env";
import { createClerkIdentityAdapter } from "./clerk-identity";
import { identityMode } from "./identity-mode";
import { webReporter } from "./reporter";

// The cookie POST /dev-signin sets. It carries the email only: the subject is derived, never
// typed, because the first sign-in binds `identity_subject` for good (0015's guard), and a
// second sign-in with another subject would be refused.
export const DEV_EMAIL_COOKIE = "trader-dev-email";
export const devSubjectFor = (email: string) => `dev:${email.trim().toLowerCase()}`;

const devAdapter = createDevIdentityAdapter();

// The browser transport: a page navigation cannot set headers, so the cookie becomes the
// subject and email development headers before the api adapter sees the request. The adapter
// and its gates are unchanged, and a request already carrying any development header is
// passed as it is.
const devBridge: IdentityAdapter = {
  identify(headers) {
    const email = cookieValue(headers.get("cookie"), DEV_EMAIL_COOKIE);
    if (
      email === null ||
      headers.has(DEV_SUBJECT_HEADER) ||
      headers.has(DEV_EMAIL_HEADER) ||
      headers.has(DEV_PHONE_HEADER)
    ) {
      return devAdapter.identify(headers);
    }
    const bridged = new Headers(headers);
    bridged.set(DEV_SUBJECT_HEADER, devSubjectFor(email));
    bridged.set(DEV_EMAIL_HEADER, email);
    return devAdapter.identify(bridged);
  },
};

// Clerk's `auth()`, imported when first needed: the module is Next's server-only code and
// cannot load outside a Next request, where the suites import this file.
const clerkAdapter = createClerkIdentityAdapter({
  readSession: async () => (await import("@clerk/nextjs/server")).auth(),
  onError: (error) =>
    reportFailure(webReporter, error, { source: "request", path: null, type: undefined }),
});

// The mode is read per request, never at module load (RULES: guards fail closed at request
// time). Without Clerk's keys no proxy ran and there is no session to read: the request has
// no identity, and every protected call answers 401.
export const webIdentity: IdentityAdapter = {
  identify(headers) {
    if (identityMode(process.env) === "dev") return devBridge.identify(headers);
    if (clerkEnv(process.env) === null) return Promise.resolve(null);
    return clerkAdapter.identify(headers);
  },
};

function cookieValue(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
