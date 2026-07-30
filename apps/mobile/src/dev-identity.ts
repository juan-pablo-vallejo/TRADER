/**
 * The mobile half of the development identity (see `apps/web/src/server/auth.ts`,
 * which owns the decision and the fail-closed rule).
 *
 * The web app authenticates with an HttpOnly cookie, which a native app has no
 * cookie jar for, so the subject travels in a header instead. The server accepts
 * it only when `DEV_AUTH_ENABLED=true`; with the flag absent this header is
 * ignored entirely and every request is a 401.
 *
 * Clerk replaces this with a bearer token, which is the same shape: a header the
 * HTTP edge turns into a verified `AuthIdentity`.
 */
export const DEV_SUBJECT_HEADER = "x-trader-dev-subject";

/** The seeded admin, and a worker who does not exist until they first sign in. */
export const DEV_SUBJECTS = ["dev_admin", "dev_worker_1"] as const;

export type DevSubject = (typeof DEV_SUBJECTS)[number];

const isDevSubject = (v: string | undefined): v is DevSubject =>
  DEV_SUBJECTS.includes(v as DevSubject);

/**
 * Identity to start signed in as, so a reload lands straight back where you were
 * instead of on the picker. Unrecognised values are ignored rather than trusted —
 * the server would reject them anyway, but failing here says why.
 */
export function initialSubject(): DevSubject | null {
  const configured = process.env.EXPO_PUBLIC_DEV_SUBJECT;
  return isDevSubject(configured) ? configured : null;
}
