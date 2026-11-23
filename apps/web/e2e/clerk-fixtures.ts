// The Clerk suite's people in `trader_demo_clerk` (clerk.config.ts), set once before it runs,
// as the database's owner on the local compose server and nowhere else. The demo binds every
// person it builds to the development identity, and no binding is ever undone (the users
// guard refuses it, the owner too), so the staging suite's admin login cannot become one of
// them. The suite's admin is a row of its own instead, inserted unbound, as the seed inserts
// the first admin: that login binds to it at its first request. No Clerk login is made for
// it. Numbers are passed to `psql` as variables and never printed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DB = "trader_demo_clerk";
export const ADMIN_NAME = "Clerk Suite Admin";

// The compose role, from the repository's `.env`, as the phone's flow suite reads it.
function role(): { user: string; password: string } {
  const env = readFileSync(join(__dirname, "../../../.env"), "utf8");
  const value = (name: string) =>
    env
      .split("\n")
      .filter((line) => line.startsWith(`${name}=`))
      .map((line) => line.slice(name.length + 1).trim())
      .pop() ?? "";
  return { user: value("POSTGRES_USER"), password: value("POSTGRES_PASSWORD") };
}

// One statement's answer, with `vars` bound as psql variables (:'name').
export function sql(statement: string, vars: Record<string, string> = {}): string {
  const { user, password } = role();
  const args = ["-h", "127.0.0.1", "-U", user, "-d", DB, "-Atq", "-v", "ON_ERROR_STOP=1"];
  for (const [name, value] of Object.entries(vars)) args.push("-v", `${name}=${value}`);
  return execFileSync("psql", args, {
    input: statement,
    env: { ...process.env, PGPASSWORD: password },
    encoding: "utf8",
  }).trim();
}

// The one login the suite makes itself, by roster.invite in the address-change test, at a
// number of the fictional range that is none of the staging suite's people. A run that
// stopped halfway may have left an email on it, which would make the next run's change
// "already held": every email it holds is taken off before anything runs.
export const READDRESS_PHONE = "+14015550181";
const CLERK_API = "https://api.clerk.com/v1";

export async function clerk(path: string, method = "GET"): Promise<unknown> {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}` },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Clerk answered ${response.status} to ${method}`);
  return response.json();
}

// The suite's own login's id, or null before its first run.
export async function readdressLogin(): Promise<{
  id: string;
  emails: string[];
} | null> {
  const found = (await clerk(
    `/users?${new URLSearchParams({ phone_number: READDRESS_PHONE }).toString()}`,
  )) as { id: string; email_addresses: { id: string }[] }[];
  const [user] = found;
  return user === undefined
    ? null
    : { id: user.id, emails: user.email_addresses.map((e) => e.id) };
}

export default async function setUp(): Promise<void> {
  const login = await readdressLogin();
  for (const email of login?.emails ?? []) {
    await clerk(`/email_addresses/${email}`, "DELETE");
  }
  const added = sql(
    `INSERT INTO users (company_id, name, role, sign_in_phone)
       SELECT company_id, :'name', 'admin', :'admin' FROM users WHERE email = 'office@demo.invalid'
       RETURNING 1;`,
    { name: ADMIN_NAME, admin: process.env.E2E_ADMIN_PHONE ?? "" },
  );
  if (added !== "1")
    throw new Error("the suite's admin was not added to the demo company");
}
