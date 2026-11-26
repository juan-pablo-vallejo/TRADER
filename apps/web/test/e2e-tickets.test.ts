// The staging suite's sign-in tickets (e2e/tickets.ts) and where the key that makes them
// may be named. No Clerk, no network.
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

// Two of Clerk's fictional numbers, as a run would be given them.
const ADMIN_PHONE = "+14015550100";
const WORKER_PHONE = "+14015550101";
const SETTINGS = {
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
    const { exit, written, said } = await run({ CLERK_SECRET_KEY: ` ${KEY}\n` }, both);
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
    const { exit, written, said } = await run({ CLERK_SECRET_KEY: KEY }, [both[0]]);
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
        { CLERK_SECRET_KEY: KEY, [name]: "" },
        both,
      );
      expect(exit).toBe(1);
      expect(calls).toEqual([]);
      expect(written).toEqual([]);
      expect(said).toEqual([`sign-in tickets not made: ${name} not set`]);
    }
  });
});

// The suite's two people have no default: a run that is not told both
// must stop, never go on as people nobody named.
describe("the suite's required settings", () => {
  it("names every setting left unset or blank, and none when all are given", () => {
    // Both, by name: a name dropped from the list is a check dropped from every run.
    expect([...SUITE_SETTINGS]).toEqual(["E2E_ADMIN_PHONE", "E2E_WORKER_PHONE"]);
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
          APP_URL: "https://staging.invalid",
          E2E_ADMIN_TICKET: "",
          E2E_WORKER_TICKET: "",
          ...given,
        },
      },
    );

  it("loads its five tests when told both people", () => {
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

// The key is a secret of the `staging` environment. These hold the repository's side of
// that: where a secret is named, and what may start the job that holds it.
describe("the workflows and the staging key", () => {
  const dir = join(__dirname, "../../../.github/workflows");
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const text = (file: string) => readFileSync(join(dir, file), "utf8");
  const ci = text("ci.yml");
  const STEP = `\n${" ".repeat(6)}- `;
  const jobs = ci
    .slice(ci.indexOf("\njobs:"))
    .split(/\n {2}(?=[a-z-]+:\n)/)
    .slice(1);
  const job = (name: string) => jobs.find((j) => j.startsWith(`${name}:\n`))!;
  const deploy = job("deploy");
  const stepAt = (needle: string) => {
    const at = deploy.indexOf(needle);
    expect(at, needle).toBeGreaterThan(0);
    const end = deploy.indexOf(STEP, at);
    return deploy.slice(deploy.lastIndexOf(STEP, at), end === -1 ? undefined : end);
  };
  const PRODUCTION_ONLY =
    "github.ref == 'refs/heads/production' && 'production' || 'staging'";

  it("names the Clerk key in the deploy job alone, once, for the ticket step", () => {
    for (const file of files) {
      const named = text(file)
        .split("\n")
        .filter((l) => l.includes("CLERK_SECRET_KEY"));
      if (file !== "ci.yml") expect(named, file).toEqual([]);
    }
    expect(ci.split("\n").filter((l) => l.includes("CLERK_SECRET_KEY"))).toHaveLength(1);
    expect(deploy).toContain("secrets.CLERK_SECRET_KEY");
    const step = stepAt("secrets.CLERK_SECRET_KEY");
    expect(step).toContain("node apps/web/e2e/tickets.ts");
    // The step that holds the key installs nothing and runs no package's code.
    expect(step).not.toMatch(/pnpm|npm |npx|playwright/);
  });

  it("holds every secret in the deploy job, which runs only on a push", () => {
    expect(jobs.map((j) => j.slice(0, j.indexOf(":")))).toEqual(["check", "deploy"]);
    expect(job("check")).not.toMatch(/secrets\.|environment:/);
    expect(deploy).toMatch(/\n {4}needs: check\n/);
    expect(deploy).toMatch(/\n {4}if: github\.event_name == 'push'\n/);
    // Beside it, the two phone workflows, each with its own named secrets and no other.
    // Every other workflow holds none.
    for (const file of files) {
      if (!["ci.yml", "preview-phone.yml", "release-phone.yml"].includes(file)) {
        expect(text(file), file).not.toMatch(/secrets\./);
      }
    }
  });

  const secretsIn = (file: string) =>
    [
      ...new Set([...text(file).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1])),
    ].sort();

  it("deploys staging unless the phone app and Markdown are all a commit adds", () => {
    const changes = stepAt("id: changes");
    // First, before anything is installed, and against what staging serves.
    expect(deploy.indexOf("id: changes")).toBeLessThan(deploy.indexOf("pnpm install"));
    expect(changes).toContain("/api/ready");
    expect(changes).toContain("'^apps/mobile/|\\.md$'");
    expect(changes).toContain('if [ "$TARGET" = staging ]');
    expect(changes).not.toMatch(/pnpm|npm |npx|playwright|secrets\.(?!APP_URL\b)/);
    // Every step after it waits on its answer: none migrates, deploys or tests alone.
    const after = deploy.slice(deploy.indexOf(STEP, deploy.indexOf("id: changes")));
    const steps = after.split(STEP).slice(1);
    expect(steps.length).toBeGreaterThan(5);
    for (const step of steps) {
      expect(step, step.split("\n")[0]).toContain(
        "steps.changes.outputs.deploy == 'true'",
      );
    }
  });

  it("builds a preview by hand alone, with staging's Expo token and no store key", () => {
    const preview = text("preview-phone.yml");
    expect(secretsIn("preview-phone.yml").sort()).toEqual(["APP_URL", "EXPO_TOKEN"]);
    expect(preview).toMatch(/\non:\n {2}workflow_dispatch:\n\npermissions:/);
    expect(preview).toContain("\n    environment: staging\n");
    expect(preview).toContain("--profile preview");
    expect(preview).not.toMatch(/submit|production/);
  });

  it("releases the phone app on a push to production alone, with the five secrets", () => {
    const release = text("release-phone.yml");
    expect(secretsIn("release-phone.yml")).toEqual([
      "ASC_API_KEY_ID",
      "ASC_API_KEY_ISSUER_ID",
      "ASC_API_KEY_P8",
      "EXPO_TOKEN",
      "GOOGLE_SERVICE_ACCOUNT_KEY",
    ]);
    expect(release).toMatch(
      /\non:\n {2}push:\n {4}branches: \[production\]\n\npermissions:/,
    );
    expect(release).not.toMatch(
      /workflow_dispatch|workflow_run|pull_request_target|issue_comment|environment: staging/,
    );
    expect(release).toContain("\n    environment: production\n");
    // Creating the branch is a push too, and releases nothing.
    expect(release).toContain("\n    if: github.event.created != true\n");
    // Every secret is checked before anything is installed or Expo is called.
    const checked = release.indexOf("not set in the production environment");
    expect(checked).toBeGreaterThan(0);
    expect(checked).toBeLessThan(release.indexOf("pnpm install"));
    expect(checked).toBeLessThan(release.indexOf("eas-cli"));
    // ci.yml's deploy, run again on production, starts nothing of the phone's.
    expect(ci).not.toMatch(/eas|expo/i);
  });

  it("is started by a push or a pull request and by nothing else", () => {
    const triggers = ci.slice(ci.indexOf("\non:"), ci.indexOf("\npermissions:"));
    expect(triggers).toMatch(/push:\n {4}branches: \[main, production\]/);
    expect(triggers).toMatch(/pull_request:\n {4}branches: \[main, production\]/);
    expect(ci).not.toMatch(
      /workflow_dispatch|workflow_run|pull_request_target|issue_comment/,
    );
  });

  it("selects the production environment for the production ref alone", () => {
    expect(deploy).toContain(`\n    environment: \${{ ${PRODUCTION_ONLY} }}\n`);
    expect(deploy).toContain(`\n      group: deploy-\${{ ${PRODUCTION_ONLY} }}\n`);
    expect(deploy).toContain(`\n      TARGET: \${{ ${PRODUCTION_ONLY} }}\n`);
    expect(deploy).toMatch(/\n {6}cancel-in-progress: false\n/);
    // Nothing else in any workflow names the environment or the branch's ref.
    // and the phone's release, which is production's alone by its trigger.
    for (const file of files) {
      const rest = text(file).split(PRODUCTION_ONLY).join("");
      expect(rest, file).not.toMatch(/refs\/heads\/production/);
      if (file === "release-phone.yml") {
        expect(rest.match(/environment: production/g), file).toHaveLength(1);
      } else {
        expect(rest, file).not.toMatch(/environment: production/);
      }
    }
  });

  it("migrates with a stated purpose and the environment's own migrator", () => {
    const step = stepAt("secrets.MIGRATOR_URL");
    expect(step).toContain("secrets.MIGRATOR_URL");
    // One name in each environment: no branch on the target picks it.
    expect(step).not.toContain('$TARGET" = production');
    expect(step).toContain(
      'DATABASE_URL="$MIGRATOR_URL" TRADER_MIGRATE_PURPOSE=deploy pnpm db:migrate',
    );
  });

  it("deploys by the hook alone, held to Vercel's address and to this run's commit", () => {
    expect(ci).not.toMatch(/git push|contents: write|ssh-key|DEPLOY_KEY/);
    expect(ci.split("\n").filter((l) => l.includes("secrets.DEPLOY_HOOK"))).toHaveLength(
      1,
    );
    const step = stepAt("secrets.DEPLOY_HOOK");
    expect(step).toContain("https://api.vercel.com/v1/integrations/deploy/*)");
    // The hook builds the branch's head, so it is called only while that is this commit.
    expect(step).toContain('[ "$head" != "$SHA" ]');
    expect(step.indexOf('[ "$head" != "$SHA" ]')).toBeLessThan(step.indexOf("-X POST"));
    expect(step).not.toMatch(/pnpm|npm |npx/);
  });

  it("skips the wait and the smoke test in a superseded run, and holds the smoke test to the commit", () => {
    const after = deploy.slice(deploy.indexOf('echo "result=called"'));
    const steps = after.split(STEP).slice(1);
    // The wait, then the browser (its version, its cache, its install), the tickets, the test.
    expect(steps).toHaveLength(6);
    for (const step of steps) {
      expect(step).toContain("steps.hook.outputs.result != 'superseded'");
    }
    for (const step of steps.slice(1)) expect(step).toContain("env.TARGET == 'staging'");
    expect(after.indexOf('[ "$commit" = "$SHA" ]')).toBeGreaterThan(0);
    expect(after.indexOf('[ "$commit" = "$SHA" ]')).toBeLessThan(
      after.indexOf("pnpm e2e:staging"),
    );
  });

  it("gives no workflow a Vercel account token or a production key", () => {
    for (const file of files) {
      expect(text(file), file).not.toMatch(
        /VERCEL_TOKEN|VERCEL_ORG_ID|vercel[^\n]*--prod|sk_live_/,
      );
    }
  });
});
