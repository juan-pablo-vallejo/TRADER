// The identity adapter seam at the HTTP edge (RULES: three thin seams). The development
// adapter is the only implementation until Clerk's (Stage 6) replaces it here; packages/api
// never sees a token.
import {
  createDevIdentityAdapter,
  DEV_EMAIL_HEADER,
  DEV_PHONE_HEADER,
  DEV_SUBJECT_HEADER,
  type IdentityAdapter,
} from "@trader/api";

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
export const webIdentity: IdentityAdapter = {
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

function cookieValue(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
