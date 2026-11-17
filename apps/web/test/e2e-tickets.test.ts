// The staging suite's sign-in tickets (e2e/tickets.ts) and where the key that makes them
// may be named (RULES, Git and CI: a workflow that holds a secret). No Clerk, no network.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLERK_API,
  mintForWorkflow,
  mintTicket,
  missingSettings,
  SUITE_SETTINGS,
  TICKET_SECONDS,
} from "../e2e/tickets";

// Two of Clerk's fictional numbers and a company's id, as a run would be given them.
const ADMIN_PHONE = "+14015550100";
const WORKER_PHONE = "+14015550101";
const SETTINGS = {
  E2E_COMPANY_ID: "01900000-0000-7000-8000-000000000001",
  E2E_ADMIN_PHONE: ADMIN_PHONE,
  E2E_WORKER_PHONE: WORKER_PHONE,
};

const KEY = "sk_test_abcDEF123";
const TICKET = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJl";
const user = (id: string, ...numbers: string[]) => ({
  id,
  phone_numbers: numbers.map((phone_number) => ({ phone_number })),
});

type Call = { url: string; init: RequestInit };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
// A stand-in for Clerk: the user list, then the token.
function clerk(users: unknown, token: unknown = { token: TICKET }) {
  const calls: Call[] = [];
  const send = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(url.includes("/sign_in_tokens") ? json(token) : json(users));
  }) as unknown as typeof fetch;
  return { calls, send };
}

describe("mintTicket", () => {
  it("asks Clerk for the one holder of the number, then for a short single ticket", async () => {
    const { calls, send } = clerk([user("user_admin1", ADMIN_PHONE)]);
    expect(await mintTicket({ secretKey: KEY, fetch: send }, ADMIN_PHONE)).toEqual({
      ok: true,
      ticket: TICKET,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(`${CLERK_API}/users?phone_number=%2B14015550100&limit=10`);
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[1]!.url).toBe(`${CLERK_API}/sign_in_tokens`);
    expect(calls[1]!.init.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      user_id: "user_admin1",
      expires_in_seconds: TICKET_SECONDS,
    });
    for (const { init } of calls) {
      expect(init.headers).toEqual({
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      });
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(TICKET_SECONDS).toBeLessThanOrEqual(600);
  });

  it("asks nothing with no key, a production key, or a number that could be a person's", async () => {
    const cases = [
      ["", ADMIN_PHONE, "key_not_set"],
      ["sk_live_abcDEF123", ADMIN_PHONE, "key_not_of_a_development_instance"],
      ["pk_test_abcDEF123", ADMIN_PHONE, "key_not_of_a_development_instance"],
      [KEY, "+14015551234", "number_not_fictional"],
      [KEY, "+14015550200", "number_not_fictional"],
      [KEY, "4015550100", "number_not_fictional"],
    ] as const;
    for (const [secretKey, phone, failure] of cases) {
      const { calls, send } = clerk([user("user_admin1", phone)]);
      expect(await mintTicket({ secretKey, fetch: send }, phone)).toEqual({
        ok: false,
        failure,
      });
      expect(calls).toHaveLength(0);
    }
  });

  it("makes no ticket unless exactly one user holds the number itself", async () => {
    const cases = [
      [[], "user_not_found"],
      // A filter Clerk ignored: somebody else comes back, and is not taken.
      [[user("user_other1", WORKER_PHONE)], "user_not_found"],
      [[user("user_a1", ADMIN_PHONE), user("user_b2", ADMIN_PHONE)], "user_ambiguous"],
      [{ data: [] }, "answer_unreadable"],
      [
        [{ id: "org_1", phone_numbers: [{ phone_number: ADMIN_PHONE }] }],
        "answer_unreadable",
      ],
    ] as const;
    for (const [users, failure] of cases) {
      const { calls, send } = clerk(users);
      expect(await mintTicket({ secretKey: KEY, fetch: send }, ADMIN_PHONE)).toEqual({
        ok: false,
        failure,
      });
      expect(calls.filter((c) => c.url.includes("sign_in_tokens"))).toHaveLength(0);
    }
  });

  it("reads a refusal, an unreachable Clerk and an unreadable answer as what they are", async () => {
    const refused = (() =>
      Promise.resolve(json({ errors: [] }, 401))) as unknown as typeof fetch;
    const down = (() => Promise.reject(new Error("no route"))) as unknown as typeof fetch;
    const noToken = clerk([user("user_admin1", ADMIN_PHONE)], { token: 7 }).send;
    for (const [send, failure] of [
      [refused, "clerk_refused"],
      [down, "clerk_unreachable"],
      [noToken, "answer_unreadable"],
    ] as const) {
      expect(await mintTicket({ secretKey: KEY, fetch: send }, ADMIN_PHONE)).toEqual({
        ok: false,
        failure,
      });
    }
  });
});

describe("mintForWorkflow", () => {
  // The two numbers are given unless a test takes one away.
  const run = async (given: Record<string, string>, users: unknown) => {
    const written: string[] = [];
    const said: string[] = [];
    const { calls, send } = clerk(users);
    const exit = await mintForWorkflow(
      { E2E_ADMIN_PHONE: ADMIN_PHONE, E2E_WORKER_PHONE: WORKER_PHONE, ...given },
      {
        fetch: send,
        write: (line) => written.push(line),
        say: (line) => said.push(line),
      },
    );
    return { exit, written, said, calls };
  };
  const both = [user("user_admin1", ADMIN_PHONE), user("user_worker1", WORKER_PHONE)];

  it("writes both tickets to the environment file and masks each before anything else", async () => {
    const { exit, written, said } = await run(
      { CLERK_STAGING_SECRET_KEY: ` ${KEY}\n` },
      both,
    );
    expect(exit).toBe(0);
    expect(written).toEqual([
      `E2E_ADMIN_TICKET=${TICKET}`,
      `E2E_WORKER_TICKET=${TICKET}`,
    ]);
    expect(said.slice(0, 2)).toEqual([`::add-mask::${TICKET}`, `::add-mask::${TICKET}`]);
    // Beyond the mask commands, nothing said holds a ticket or the key.
    for (const line of said.slice(2)) {
      expect(line).not.toContain(TICKET);
      expect(line).not.toContain(KEY);
    }
  });

  it("writes neither ticket when one cannot be made, and says only why", async () => {
    const { exit, written, said } = await run({ CLERK_STAGING_SECRET_KEY: KEY }, [
      both[0],
    ]);
    expect(exit).toBe(1);
    expect(written).toEqual([]);
    expect(said.at(-1)).toBe(
      "sign-in ticket not made (E2E_WORKER_TICKET): user_not_found",
    );
    expect(said.join("\n")).not.toContain(KEY);
  });

  it("makes no ticket and asks Clerk nothing when a number is not given", async () => {
    for (const name of ["E2E_ADMIN_PHONE", "E2E_WORKER_PHONE"]) {
      const { exit, written, said, calls } = await run(
        { CLERK_STAGING_SECRET_KEY: KEY, [name]: "" },
        both,
      );
      expect(exit).toBe(1);
      expect(calls).toEqual([]);
      expect(written).toEqual([]);
      expect(said).toEqual([`sign-in tickets not made: ${name} not set`]);
    }
  });
});

// The suite's company and its two people have no default: a run that is not told all three
// must stop, never go on without the tenant check or as people nobody named.
describe("the suite's required settings", () => {
  it("names every setting left unset or blank, and none when all are given", () => {
    // The three, by name: a name dropped from the list is a check dropped from every run.
    expect([...SUITE_SETTINGS]).toEqual([
      "E2E_COMPANY_ID",
      "E2E_ADMIN_PHONE",
      "E2E_WORKER_PHONE",
    ]);
    expect(missingSettings(SETTINGS)).toEqual([]);
    expect(missingSettings({})).toEqual([...SUITE_SETTINGS]);
    for (const name of SUITE_SETTINGS) {
      expect(missingSettings({ ...SETTINGS, [name]: "" })).toEqual([name]);
      expect(missingSettings({ ...SETTINGS, [name]: "  " })).toEqual([name]);
      expect(missingSettings({ ...SETTINGS, [name]: undefined })).toEqual([name]);
    }
  });

  // The suite itself, loaded by Playwright as a run loads it, with no browser started:
  // listing its tests is what fails when the file refuses to load.
  const list = (given: Record<string, string>) =>
    spawnSync(
      "pnpm",
      ["exec", "playwright", "test", "-c", "e2e/playwright.config.ts", "--list"],
      {
        cwd: join(__dirname, ".."),
        encoding: "utf8",
        env: {
          ...process.env,
          STAGING_URL: "https://staging.invalid",
          E2E_ADMIN_TICKET: "",
          E2E_WORKER_TICKET: "",
          ...given,
        },
      },
    );

  it("loads its five tests when told its company and both people", () => {
    const listed = list(SETTINGS);
    expect(listed.stdout).toContain("Total: 5 tests in 1 file");
    expect(listed.status).toBe(0);
  }, 60_000);

  it.each(SUITE_SETTINGS)(
    "loads no test and exits red without %s",
    (name) => {
      const listed = list({ ...SETTINGS, [name]: "" });
      expect(listed.status).not.toBe(0);
      expect(`${listed.stdout}${listed.stderr}`).toContain(
        `refusing to run: ${name} not set`,
      );
      expect(listed.stdout).toContain("Total: 0 tests");
    },
    60_000,
  );
});

// The key is a secret of the `staging` environment, which admits `main` alone. These hold
// the repository's side of that: where the key is named, and what may start that workflow.
describe("the workflows and the staging key", () => {
  const dir = join(__dirname, "../../../.github/workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const text = (file: string) => readFileSync(join(dir, file), "utf8");
  const promote = text("promote-staging.yml");
  const STEP = `\n${" ".repeat(6)}- `;

  it("names the Clerk key in the promotion workflow alone, once, for the ticket step", () => {
    for (const file of files) {
      const named = text(file)
        .split("\n")
        .filter((l) => l.includes("CLERK_STAGING_SECRET_KEY"));
      if (file !== "promote-staging.yml") expect(named, file).toEqual([]);
    }
    const named = promote
      .split("\n")
      .filter((l) => l.includes("secrets.CLERK_STAGING_SECRET_KEY"));
    expect(named).toHaveLength(1);
    const at = promote.indexOf("secrets.CLERK_STAGING_SECRET_KEY");
    const step = promote.slice(promote.lastIndexOf(STEP, at), promote.indexOf(STEP, at));
    expect(step).toContain("node apps/web/e2e/tickets.ts");
    // The step that holds the key installs nothing and runs no package's code.
    expect(step).not.toMatch(/pnpm|npm |npx|playwright/);
  });

  it("never starts the promotion from a pull request, and gives CI no secret", () => {
    const triggers = promote.slice(
      promote.indexOf("\non:"),
      promote.indexOf("\npermissions:"),
    );
    expect(triggers).toMatch(/workflow_run:/);
    expect(triggers).toMatch(/workflow_dispatch:/);
    expect(triggers).not.toMatch(/pull_request|issue_comment|push:/);
    // A fork's pull request reaches the promotion only as a CI run, which it refuses.
    expect(promote).toContain("github.event.workflow_run.event == 'push'");
    expect(promote).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository",
    );
    expect(text("ci.yml")).not.toMatch(/secrets\./);
  });

  it("runs every job that reads a secret from the staging environment", () => {
    const jobs = promote
      .slice(promote.indexOf("\njobs:"))
      .split(/\n {2}(?=[a-z-]+:\n)/)
      .slice(1);
    for (const job of jobs) {
      if (/secrets\./.test(job)) expect(job).toMatch(/\n {4}environment: staging\n/);
    }
    expect(jobs.length).toBe(4);
  });

  // Staging is deployed from `main` by Vercel's deploy hook (ARCHITECTURE, 2026-11-17,
  // two branches and a release by pull request): the workflow moves no branch and holds no key that could.
  it("deploys by the hook alone, held to Vercel's address and to this run's commit", () => {
    expect(promote).not.toMatch(/git push|contents: write|ssh-key|STAGING_DEPLOY_KEY/);
    expect(promote).not.toContain("staging-preview");
    const named = promote
      .split("\n")
      .filter((l) => l.includes("secrets.STAGING_DEPLOY_HOOK"));
    expect(named).toHaveLength(1);
    const at = promote.indexOf("secrets.STAGING_DEPLOY_HOOK");
    const step = promote.slice(promote.lastIndexOf(STEP, at), promote.indexOf(STEP, at));
    expect(step).toContain("https://api.vercel.com/v1/integrations/deploy/*)");
    // The hook builds the branch's head, so it is called only while that is this commit.
    expect(step).toContain('[ "$head" != "$SHA" ]');
    expect(step.indexOf('[ "$head" != "$SHA" ]')).toBeLessThan(step.indexOf("-X POST"));
    expect(step).not.toMatch(/pnpm|npm |npx/);
  });

  it("verifies the deployed commit before the suite, and reports every run's outcome", () => {
    const verify = promote.slice(promote.indexOf("\n  verify:"));
    expect(verify.indexOf('[ "$commit" = "$SHA" ]')).toBeGreaterThan(0);
    expect(verify.indexOf('[ "$commit" = "$SHA" ]')).toBeLessThan(
      verify.indexOf("pnpm e2e:staging"),
    );
    expect(promote).toMatch(/\n {2}report:\n[\s\S]*if: always\(\)/);
    expect(promote).toMatch(/\n {6}statuses: write\n/);
  });

  it("gives no workflow a Vercel account token or a production target", () => {
    for (const file of files) {
      expect(text(file), file).not.toMatch(
        /VERCEL_TOKEN|VERCEL_ORG_ID|vercel[^\n]*--prod|environment: production|refs\/heads\/production|sk_live_/,
      );
    }
  });
});
