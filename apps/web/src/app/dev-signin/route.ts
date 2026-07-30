import { NextResponse } from "next/server";

import { DEV_SUBJECT_COOKIE, devAuthEnabled } from "@/server/auth";

/**
 * Development sign-in: names a subject and sets the cookie the HTTP edge reads.
 *
 * `GET /dev-signin?subject=dev_admin`
 *
 * This is not an auth system and does not pretend to be one — it asserts an
 * identity rather than proving one, which is exactly why it is unreachable
 * unless `DEV_AUTH_ENABLED=true`. Clerk replaces it along with
 * `identityFromRequest`.
 */
export function GET(req: Request) {
  // 404, not 403: a route that refuses by name still tells a stranger it exists.
  if (!devAuthEnabled()) return new NextResponse("Not found", { status: 404 });

  const subject = new URL(req.url).searchParams.get("subject")?.trim();
  if (!subject) {
    return NextResponse.json(
      { error: "Pass ?subject=<id>, e.g. /dev-signin?subject=dev_admin" },
      { status: 400 },
    );
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(DEV_SUBJECT_COOKIE, subject, {
    // No script needs to read this, and it stands in for a session token —
    // treat it with the defaults a real one would want.
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export const dynamic = "force-dynamic";
