// Development sign-in: names an email and sets the cookie the identity seam bridges. It
// asserts an identity rather than proving one, which is why it exists only where the
// development adapter is on: switched off, it answers 404 by name (RULES), never 403, and a
// built app (NODE_ENV=production) is always off. Plain Responses, so the module is callable
// in tests as Next calls it.
import { devIdentityEnabled, signInEmailSchema } from "@trader/api";

import { DEV_EMAIL_COOKIE } from "../../server/identity";
import { strings } from "../strings";

export const dynamic = "force-dynamic";

const MAX_AGE = 30 * 24 * 60 * 60;

const notFound = () => new Response("Not found", { status: 404 });

const cookie = (value: string, maxAge: number) =>
  `${DEV_EMAIL_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

const redirectHome = (req: Request, setCookie: string) =>
  new Response(null, {
    status: 303,
    headers: { location: new URL("/", req.url).toString(), "set-cookie": setCookie },
  });

export async function GET(): Promise<Response> {
  if (!devIdentityEnabled(process.env)) return notFound();
  return new Response(FORM, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!devIdentityEnabled(process.env)) return notFound();
  const form = await req.formData();
  if (form.get("intent") === "signout") return redirectHome(req, cookie("", 0));
  const email = signInEmailSchema.safeParse(form.get("email"));
  if (!email.success) return new Response(strings.devSignInBadEmail, { status: 400 });
  return redirectHome(req, cookie(email.data, MAX_AGE));
}

const FORM = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${strings.devSignIn}</title>
</head>
<body>
<main>
<h1>${strings.devSignIn}</h1>
<form method="post">
<label for="email">${strings.email}</label>
<input id="email" name="email" type="email" autocomplete="email" required>
<button type="submit">${strings.signIn}</button>
</form>
<form method="post">
<input type="hidden" name="intent" value="signout">
<button type="submit">${strings.signOut}</button>
</form>
</main>
</body>
</html>
`;
