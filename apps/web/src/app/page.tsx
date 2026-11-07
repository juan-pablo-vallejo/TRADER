import Link from "next/link";

import { devIdentityEnabled } from "@trader/api";

import { strings } from "./strings";

// The shell's home: the office screens by name. Read per request, never at build: the sign-in
// link exists only where the development identity is on.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <h1 className="title">{strings.wordmark}</h1>
      <ul>
        <li>
          <Link href="/roster">{strings.roster}</Link>
        </li>
        <li>
          <Link href="/customers">{strings.customers}</Link>
        </li>
        <li>
          <Link href="/crews">{strings.crews}</Link>
        </li>
        <li>
          <Link href="/profile">{strings.profile}</Link>
        </li>
        {devIdentityEnabled(process.env) && (
          <li>
            <a href="/dev-signin">{strings.devSignIn}</a>
          </li>
        )}
      </ul>
    </>
  );
}
