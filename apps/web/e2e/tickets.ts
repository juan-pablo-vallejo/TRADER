// Sign-in tickets for the staging browser suite (ARCHITECTURE, 2026-11-16, staging sign-in
// by ticket). Clerk's fixed test code signs anyone in as any fictional number, and the
// suite's numbers are in this public repository; a ticket is made with the development
// instance's secret key, for one named user, used once and dead in ten minutes. So the
// suite keeps signing in unattended once the owner turns Clerk's test mode off.
//
// Run by the promotion workflow's verify job, by `node`, with no package beneath it and
// apart from the step that runs the browser: the key reaches this file and nothing else.
// It writes each ticket to $GITHUB_ENV, tells the runner to mask it, and prints codes only.
// The request is Clerk's as its pages document it (Backend API, `GET /v1/users` and
// `POST /v1/sign_in_tokens`, read 2026-11-16). Consumed by staging.spec.ts (the suite's
// required settings), the workflow and test/e2e-tickets.test.ts.
import { appendFileSync } from "node:fs";

export const CLERK_API = "https://api.clerk.com/v1";
// Long enough for the browser's install between the two steps; short enough to be useless
// to whoever reads it later.
export const TICKET_SECONDS = 600;
export const REQUEST_TIMEOUT_MS = 15_000;

// What the suite must be told and has no default for: its own company on the shared
// database and its two people there. A default would let a run with one of them unset go
// on without the tenant check, or as people nobody named.
export const SUITE_SETTINGS = [
  "E2E_COMPANY_ID",
  "E2E_ADMIN_PHONE",
  "E2E_WORKER_PHONE",
] as const;
export type SuiteSetting = (typeof SUITE_SETTINGS)[number];

// The names among `names` that `env` leaves unset. A variable set and blank, as an unset
// one arrives from a workflow, is unset.
export function missingSettings(
  env: Record<string, string | undefined>,
  names: readonly SuiteSetting[] = SUITE_SETTINGS,
): SuiteSetting[] {
  return names.filter((name) => (env[name] ?? "").trim() === "");
}

// Clerk's fictional range: nothing here ever names a real person's number.
const FICTIONAL = /^\+1[2-9][0-9]{2}55501[0-9]{2}$/;
// A development instance's key. Production's begins `sk_live_` and is refused.
const DEVELOPMENT_KEY = /^sk_test_[A-Za-z0-9]+$/;
const USER_ID = /^user_[A-Za-z0-9]+$/;

export type TicketFailure =
  | "key_not_set"
  | "key_not_of_a_development_instance"
  | "number_not_fictional"
  | "user_not_found"
  | "user_ambiguous"
  | "clerk_refused"
  | "clerk_unreachable"
  | "answer_unreadable";

export type TicketResult =
  { ok: true; ticket: string } | { ok: false; failure: TicketFailure };

type Deps = { secretKey: string; fetch: typeof fetch; timeoutMs?: number };

const failed = (failure: TicketFailure): TicketResult => ({ ok: false, failure });

async function ask(
  deps: Deps,
  path: string,
  init: { method: "GET" } | { method: "POST"; body: string },
): Promise<{ ok: true; body: unknown } | { ok: false; failure: TicketFailure }> {
  let response: Response;
  try {
    response = await deps.fetch(`${CLERK_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${deps.secretKey}`,
        "Content-Type": "application/json",
      },
      // Never followed: the key goes to Clerk's host and no other.
      redirect: "error",
      signal: AbortSignal.timeout(deps.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: "clerk_unreachable" };
  }
  // A refusal's body is never read: it may quote the request.
  if (!response.ok) return { ok: false, failure: "clerk_refused" };
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, failure: "answer_unreadable" };
  }
}

// The one user who holds `phone`, by id. The list is filtered here as well as by Clerk: a
// filter Clerk ignored must not hand back somebody else.
function userHolding(
  body: unknown,
  phone: string,
): { id: string } | { failure: TicketFailure } {
  if (!Array.isArray(body)) return { failure: "answer_unreadable" };
  const holders = body.filter((user: unknown) => {
    const numbers = (user as { phone_numbers?: unknown }).phone_numbers;
    return (
      Array.isArray(numbers) &&
      numbers.some(
        (n: unknown) => (n as { phone_number?: unknown }).phone_number === phone,
      )
    );
  });
  if (holders.length === 0) return { failure: "user_not_found" };
  if (holders.length > 1) return { failure: "user_ambiguous" };
  const id = (holders[0] as { id?: unknown }).id;
  return typeof id === "string" && USER_ID.test(id)
    ? { id }
    : { failure: "answer_unreadable" };
}

export async function mintTicket(deps: Deps, phone: string): Promise<TicketResult> {
  if (deps.secretKey === "") return failed("key_not_set");
  if (!DEVELOPMENT_KEY.test(deps.secretKey))
    return failed("key_not_of_a_development_instance");
  if (!FICTIONAL.test(phone)) return failed("number_not_fictional");

  const query = new URLSearchParams({ phone_number: phone, limit: "10" });
  const users = await ask(deps, `/users?${query.toString()}`, { method: "GET" });
  if (!users.ok) return failed(users.failure);
  const user = userHolding(users.body, phone);
  if ("failure" in user) return failed(user.failure);

  const made = await ask(deps, "/sign_in_tokens", {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, expires_in_seconds: TICKET_SECONDS }),
  });
  if (!made.ok) return failed(made.failure);
  const ticket = (made.body as { token?: unknown } | null)?.token;
  return typeof ticket === "string" && /^[A-Za-z0-9._-]{20,4096}$/.test(ticket)
    ? { ok: true, ticket }
    : failed("answer_unreadable");
}

// What the workflow step runs. Both tickets or neither: a suite with one would sign its
// other person in by the test code and hide that the ticket path is broken.
export async function mintForWorkflow(
  env: Record<string, string | undefined>,
  deps: {
    fetch: typeof fetch;
    write: (line: string) => void;
    say: (line: string) => void;
  },
): Promise<number> {
  // Before the key is used: a number left unset names nobody, and is never guessed.
  const missing = missingSettings(env, ["E2E_ADMIN_PHONE", "E2E_WORKER_PHONE"]);
  if (missing.length > 0) {
    deps.say(`sign-in tickets not made: ${missing.join(", ")} not set`);
    return 1;
  }
  const people = [
    ["E2E_ADMIN_TICKET", (env.E2E_ADMIN_PHONE ?? "").trim()],
    ["E2E_WORKER_TICKET", (env.E2E_WORKER_PHONE ?? "").trim()],
  ] as const;
  const lines: string[] = [];
  for (const [name, phone] of people) {
    const result = await mintTicket(
      { secretKey: (env.CLERK_STAGING_SECRET_KEY ?? "").trim(), fetch: deps.fetch },
      phone,
    );
    if (!result.ok) {
      deps.say(`sign-in ticket not made (${name}): ${result.failure}`);
      return 1;
    }
    // Masked before it can reach any later line of the log.
    deps.say(`::add-mask::${result.ticket}`);
    lines.push(`${name}=${result.ticket}`);
  }
  for (const line of lines) deps.write(line);
  deps.say(
    `sign-in tickets made: ${lines.length}, each for one use within ${TICKET_SECONDS} s`,
  );
  return 0;
}

// Run directly by `node`, and only then: the browser suite and the unit tests import this
// file and must mint nothing. Written without `import.meta` or a top-level await, which
// the suite's own loader does not take.
if ((process.argv[1] ?? "").endsWith("/e2e/tickets.ts")) {
  const file = process.env.GITHUB_ENV ?? "";
  if (file === "") {
    // Nowhere but a runner's environment file: a ticket is never printed.
    console.error("refusing to run: GITHUB_ENV is not set");
    process.exitCode = 64;
  } else {
    void mintForWorkflow(process.env, {
      fetch,
      write: (line) => appendFileSync(file, `${line}\n`),
      say: (line) => console.log(line),
    }).then(
      (code) => {
        process.exitCode = code;
      },
      () => {
        console.error("sign-in tickets not made: error");
        process.exitCode = 1;
      },
    );
  }
}
