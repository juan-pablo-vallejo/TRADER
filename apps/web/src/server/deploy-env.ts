// The deployed environment, checked once when the server starts (instrumentation.ts;
// ARCHITECTURE, Before the first deployment: "environment validated at start"). A request
// path never throws for a missing variable (RULES: guards fail closed at request time), so
// without this a deployment missing its database or its keys starts, answers 401 and 500,
// and looks merely broken. Here it refuses to start and says which variables, by name.
// Composed from the validators each variable already has — the database's (packages/db),
// Clerk's (clerk-env.ts), the kill switch's (api status.ts) — plus what only a deployment
// requires: a database named outright, the session's origins stated, the development
// identity off, and the error reporter's address. Pure: names in, names out, never a value.
import { invalidConfigVars } from "@trader/api";
import { parseDatabaseEnv } from "@trader/db";

import { clerkEnvFaults } from "./clerk-env";

type Env = Record<string, string | undefined>;

const blank = (value: string | undefined): boolean => (value ?? "").trim() === "";

// A Sentry DSN: https, a public key as the user, no password, a numeric project as the
// path. Public by Sentry's own definition (it can only submit events), so it is no secret;
// it is still never printed. Null when unset or malformed.
export function sentryDsn(env: Env): string | null {
  const value = env.SENTRY_DSN ?? "";
  try {
    const url = new URL(value);
    const wellFormed =
      url.protocol === "https:" &&
      url.username !== "" &&
      url.password === "" &&
      /^\/[0-9]+$/.test(url.pathname) &&
      url.search === "" &&
      url.hash === "";
    return wellFormed ? value : null;
  } catch {
    return null;
  }
}

function databaseFaults(env: Env): string[] {
  // No compose fallback on a deployment: the URL is required, and is one. Blank is no URL.
  try {
    const { protocol } = new URL(env.DATABASE_URL ?? "");
    if (protocol !== "postgres:" && protocol !== "postgresql:") return ["DATABASE_URL"];
  } catch {
    return ["DATABASE_URL"];
  }
  try {
    parseDatabaseEnv(env);
    return [];
  } catch (error) {
    // A zod error names each variable in its issues' paths; its message would quote values.
    const issues = (error as { issues?: { path?: unknown[] }[] }).issues ?? [];
    const names = issues.map((issue) => String(issue.path?.[0] ?? "DATABASE_URL"));
    return names.length > 0 ? [...new Set(names)] : ["DATABASE_URL"];
  }
}

// Every variable a deployment may not start with, by name, in .env.example's order.
export function deployEnvFaults(env: Env): string[] {
  const clerk = clerkEnvFaults(env);
  return [
    ...databaseFaults(env),
    ...clerk,
    // Blank leaves the check to Clerk's default, which a deployment does not accept: the
    // origins a session may have been issued to are stated.
    ...(blank(env.CLERK_AUTHORIZED_PARTIES) && !clerk.includes("CLERK_AUTHORIZED_PARTIES")
      ? ["CLERK_AUTHORIZED_PARTIES"]
      : []),
    // Never consulted under a production build (identity-mode.ts); set there, it is a
    // deployment configured as a development machine, and that is refused outright.
    ...(blank(env.TRADER_DEV_IDENTITY) ? [] : ["TRADER_DEV_IDENTITY"]),
    ...invalidConfigVars(env),
    ...(sentryDsn(env) === null ? ["SENTRY_DSN"] : []),
  ];
}

export function assertDeployEnv(env: Env): void {
  const faults = deployEnvFaults(env);
  if (faults.length > 0) {
    throw new Error(`refusing to start: missing or invalid ${faults.join(", ")}`);
  }
}
