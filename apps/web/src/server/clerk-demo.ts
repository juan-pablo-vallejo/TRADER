// Clerk behind the Demo sign-in's door (packages/api, core/demo-door.ts). The API decides
// who is admitted, from its own rows; this file only asks Clerk for a single-use sign-in
// token for the one user who holds a number, and never for anybody the API did not admit.
//
// Two documented calls, Clerk's Backend API `GET /v1/users` and `POST /v1/sign_in_tokens`
// (read 2026-11-19; the same two the smoke test's tickets use, e2e/tickets.ts), made with
// `fetch` so the timeout and every answer are stated here. A token is good once and for a
// minute: the phone redeems it at once (`ticket` strategy) or asks again.
//
// The door exists only where the deployment sets both DEMO_SIGN_IN_CODE and
// DEMO_COMPANY_ID (.env.example). Blank, there is no door and demo.signIn refuses everyone.
// Nothing of a response is kept, logged or thrown: it names a person. An error carries the
// call and the HTTP status, no more.
import type { DemoDoor } from "@trader/api";

import { clerkEnv } from "./clerk-env";

type Env = Record<string, string | undefined>;

const CLERK_API = "https://api.clerk.com/v1";
export const TICKET_SECONDS = 60;
export const TICKET_TIMEOUT_MS = 5_000;

// Long enough that guessing it is not a plan, and typed by a reviewer once: 16 to 128
// characters, none of them a space.
const CODE = /^\S{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID = /^user_[A-Za-z0-9]{1,250}$/;
const TOKEN = /^[A-Za-z0-9._-]{20,4096}$/;

const blank = (value: string | undefined) => (value ?? "").trim() === "";

// A pair: both blank is no door, which is a choice. One without the other, or either
// malformed, is a mistake, named so a deployment refuses to start (deploy-env.ts).
export function demoEnvFaults(env: Env): string[] {
  const code = blank(env.DEMO_SIGN_IN_CODE);
  const company = blank(env.DEMO_COMPANY_ID);
  if (code && company) return [];
  return [
    ...(code || !CODE.test(env.DEMO_SIGN_IN_CODE ?? "") ? ["DEMO_SIGN_IN_CODE"] : []),
    ...(company || !UUID.test((env.DEMO_COMPANY_ID ?? "").trim())
      ? ["DEMO_COMPANY_ID"]
      : []),
  ];
}

export function demoEnv(env: Env): { code: string; companyId: string } | null {
  if (blank(env.DEMO_SIGN_IN_CODE) || demoEnvFaults(env).length > 0) return null;
  return {
    code: env.DEMO_SIGN_IN_CODE ?? "",
    companyId: (env.DEMO_COMPANY_ID ?? "").trim().toLowerCase(),
  };
}

export class ClerkDemoError extends Error {
  constructor(
    readonly call: "users" | "sign_in_tokens",
    readonly status: number,
  ) {
    super(`Clerk refused the demo ticket: ${call} ${String(status)}`);
    this.name = "ClerkDemoError";
  }
}

export function createClerkDemoDoor(deps: {
  code: string;
  companyId: string;
  secretKey: string;
  fetch: typeof fetch;
}): DemoDoor {
  const ask = async (
    call: "users" | "sign_in_tokens",
    path: string,
    init: { method: "GET" } | { method: "POST"; body: string },
  ): Promise<unknown> => {
    const response = await deps.fetch(`${CLERK_API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${deps.secretKey}`,
        "content-type": "application/json",
      },
      // Never followed: the key goes to Clerk's host and no other.
      redirect: "error",
      signal: AbortSignal.timeout(TICKET_TIMEOUT_MS),
    });
    // A refusal's body is never read: it may quote the request.
    if (!response.ok) throw new ClerkDemoError(call, response.status);
    return response.json() as Promise<unknown>;
  };

  return {
    code: deps.code,
    companyId: deps.companyId,
    async ticket(phone) {
      const query = new URLSearchParams({ phone_number: phone, limit: "10" });
      const listed = await ask("users", `/users?${query.toString()}`, { method: "GET" });
      // Filtered here as well as by Clerk: a filter Clerk ignored must not hand back
      // somebody else. Nobody, or more than one, holds the number: no ticket.
      const holders = (Array.isArray(listed) ? listed : []).filter((user: unknown) => {
        const numbers = (user as { phone_numbers?: unknown } | null)?.phone_numbers;
        return (
          Array.isArray(numbers) &&
          numbers.some(
            (n: unknown) =>
              (n as { phone_number?: unknown } | null)?.phone_number === phone,
          )
        );
      });
      if (holders.length !== 1) return null;
      const id = (holders[0] as { id?: unknown }).id;
      if (typeof id !== "string" || !USER_ID.test(id)) return null;

      const made = await ask("sign_in_tokens", "/sign_in_tokens", {
        method: "POST",
        body: JSON.stringify({ user_id: id, expires_in_seconds: TICKET_SECONDS }),
      });
      const token = (made as { token?: unknown } | null)?.token;
      return typeof token === "string" && TOKEN.test(token) ? token : null;
    },
  };
}

// Read per request, never at module load, as the identity is (identity.ts). Without the
// pair, or without Clerk's keys, there is no door.
export function webDemo(): DemoDoor | null {
  const demo = demoEnv(process.env);
  const clerk = clerkEnv(process.env);
  if (demo === null || clerk === null) return null;
  return createClerkDemoDoor({ ...demo, secretKey: clerk.secretKey, fetch });
}
