// The staging acceptance flow, in a real browser against a deployment of the staging
// project. With the automation bypass in the environment it is a protected preview and the
// wall is checked first; without it, it is staging's public host, which must answer with
// no bypass at all. Then an
// admin's sign-in through Clerk, one fixture customer rewritten and read back, sign-out, and
// a worker refused the office. Identities are Clerk's fictional numbers and must already be
// on the staging roster. Given tickets (tickets.ts; the deploy job always gives
// them) each person signs in with a single-use Clerk sign-in token, a made-up ticket is
// seen refused and a used one seen dead; given none, by the number and Clerk's test code,
// which works only while the development instance's test mode is on. The flow writes one customer row and
// rewrites it on every run; it deletes nothing (cleanup is destructive).
// Staging's database holds more than one fixture company. The suite's company is the one
// its signed-in admin belongs to, read from the API; its worker must be of the same one.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { askReadiness } from "./readiness";
import { missingSettings } from "./tickets";

// A variable that is set and blank, as an unset one arrives from a workflow, is unset.
const orDefault = (value: string | undefined, fallback: string) =>
  value === undefined || value === "" ? fallback : value;
// The suite's two people are stated, every run: with one unset no test
// is loaded, so nothing signs in and nothing is written.
const unset = missingSettings(process.env);
if (unset.length > 0) {
  throw new Error(`refusing to run: ${unset.join(", ")} not set`);
}
const ADMIN_PHONE = (process.env.E2E_ADMIN_PHONE ?? "").trim();
const WORKER_PHONE = (process.env.E2E_WORKER_PHONE ?? "").trim();
const ADMIN_TICKET = orDefault(process.env.E2E_ADMIN_TICKET, "");
const WORKER_TICKET = orDefault(process.env.E2E_WORKER_TICKET, "");
// Both or neither, as tickets.ts makes them: one alone would hide a broken ticket path
// behind the test code.
if ((ADMIN_TICKET === "") !== (WORKER_TICKET === "")) {
  throw new Error(
    "E2E_ADMIN_TICKET and E2E_WORKER_TICKET are given together or not at all",
  );
}
const BY_TICKET = ADMIN_TICKET !== "";
const CLERK_TEST_CODE = "424242";
const FIXTURE_CUSTOMER = "E2E Customer";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

// The bypass is sent once, to the preview alone, and answered with a cookie the browser then
// carries. A header on every request would hand the secret to Clerk's hosts as well.
async function passTheWall(context: BrowserContext): Promise<void> {
  if (BYPASS === "") return;
  const ready = await context.request.get("/api/ready", {
    headers: {
      "x-vercel-protection-bypass": BYPASS,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect(ready.status(), "readiness behind the wall").toBe(200);
}

type TicketAnswer = { signedIn: boolean; code: string };

// A ticket handed to Clerk's own script on the sign-in page, as its custom flow documents:
// `signIn.create` with the `ticket` strategy, then `setActive` on the session it made.
// Answers what happened and never the ticket; a refusal's code is Clerk's own.
async function redeem(page: Page, ticket: string): Promise<TicketAnswer> {
  await page.goto("/sign-in");
  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 60_000 },
  );
  return page.evaluate(async (given): Promise<TicketAnswer> => {
    type Attempt = { status: string | null; createdSessionId: string | null };
    const clerk = (
      window as unknown as {
        Clerk: {
          client: { signIn: { create(p: Record<string, string>): Promise<Attempt> } };
          setActive(p: { session: string }): Promise<void>;
        };
      }
    ).Clerk;
    try {
      const attempt = await clerk.client.signIn.create({
        strategy: "ticket",
        ticket: given,
      });
      if (attempt.status !== "complete" || attempt.createdSessionId === null) {
        return { signedIn: false, code: `status_${attempt.status ?? "none"}` };
      }
      await clerk.setActive({ session: attempt.createdSessionId });
      return { signedIn: true, code: "complete" };
    } catch (error) {
      const first = (error as { errors?: { code?: unknown }[] }).errors?.[0]?.code;
      return { signedIn: false, code: typeof first === "string" ? first : "error" };
    }
  }, ticket);
}

async function signIn(page: Page, phone: string, ticket: string): Promise<void> {
  if (ticket !== "") {
    expect(await redeem(page, ticket), "the ticket signs its one person in").toEqual({
      signedIn: true,
      code: "complete",
    });
    // The office's first screen: `/` is the public homepage and asks nobody to sign in.
    await page.goto("/schedule");
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 60_000,
    });
    return;
  }
  // Clerk's own form: the number, Continue, then the six-digit code, which submits itself.
  await page.goto("/sign-in");
  const identifier = page.locator('input[name="identifier"]');
  await identifier.waitFor({ state: "visible", timeout: 60_000 });
  // The form opens on the number: the sign-in page starts it there (its page.tsx).
  await expect(identifier).toHaveAttribute("type", "tel");
  // The field shows a country code of its own: type the national number.
  await identifier.fill(phone.replace(/^\+1/, ""));
  // Enter straight after the last digit is refused as an invalid identifier; the button a
  // moment later is not.
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const code = page.locator('input[autocomplete="one-time-code"]').first();
  await code.waitFor({ state: "visible", timeout: 30_000 });
  await code.pressSequentially(CLERK_TEST_CODE, { delay: 80 });
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 60_000,
  });
}

// The signed-in caller's company, as the API itself answers it.
async function companyOf(context: BrowserContext): Promise<string> {
  const me = await context.request.get("/api/trpc/me.get");
  expect(me.status(), "the caller's own profile").toBe(200);
  const found = /"companyId":"([0-9a-f-]{36})"/.exec(await me.text());
  expect(found, "a company in the caller's profile").not.toBeNull();
  return found![1]!;
}

let adminCompany = "";

async function signOut(page: Page): Promise<void> {
  // Sign out is behind the person's name in the header.
  await page.locator("header summary").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test("the deployment answers as its kind should: walled, or public and ready", async ({
  playwright,
  context,
  baseURL,
}) => {
  expect(baseURL, "the deployment's origin").toBeTruthy();
  const answered = await askReadiness(playwright.request, baseURL!);
  if (BYPASS === "") {
    // Staging's public host: ready with nothing sent, and serving the commit the caller
    // expects when it names one.
    expect(answered.status, "the public host, no bypass").toBe(200);
    const expected = process.env.E2E_EXPECT_COMMIT ?? "";
    if (expected !== "") {
      expect(answered.commit, "the commit the host says it serves").toBe(expected);
    }
    return;
  }
  expect([401, 302, 303, 307], "no bypass, no entry").toContain(answered.status);
  await passTheWall(context);
});

test("a made-up ticket signs nobody in", async ({ context, page }) => {
  test.skip(!BY_TICKET, "no tickets were given: the sign-in is by Clerk's test code");
  await passTheWall(context);
  // The shape of a token, and nothing Clerk made.
  const forged = `${"e30".repeat(12)}.${"e30".repeat(12)}.${"A".repeat(43)}`;
  const answer = await redeem(page, forged);
  expect(answer.signedIn, "a forged ticket").toBe(false);
  const me = await context.request.get("/api/trpc/me.get");
  expect(me.status(), "a protected call after a forged ticket").toBe(401);
});

test("an admin signs in, rewrites the fixture customer, and signs out", async ({
  context,
  page,
}) => {
  await passTheWall(context);
  await signIn(page, ADMIN_PHONE, ADMIN_TICKET);

  // The suite's company is whichever one its signed-in admin belongs to: no id is stored
  // anywhere, and the worker below must be of the same one.
  adminCompany = await companyOf(context);

  await page.goto("/people");
  await expect(page.getByRole("table")).toBeVisible();

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: FIXTURE_CUSTOMER });
  await expect(page.getByRole("button", { name: "Add customer" })).toBeVisible();
  if ((await row.count()) === 0) {
    await page.getByRole("button", { name: "Add customer" }).click();
    const form = page.getByRole("form", { name: "Add customer" });
    await form.getByLabel("Name").fill(FIXTURE_CUSTOMER);
    await form.getByRole("button", { name: "Add customer" }).click();
    await expect(row).toHaveCount(1);
  }

  // A customer's name opens them in the side panel, and the address says which.
  const stamp = `e2e ${new Date().toISOString()}`;
  await row.getByRole("button", { name: `Open ${FIXTURE_CUSTOMER}` }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Notes").fill(stamp);
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText("Saved.")).toBeVisible();

  // Read back from the server, not from the form's own state: the reload opens the same
  // panel from the address.
  await page.reload();
  await expect(page.getByRole("dialog").getByLabel("Notes")).toHaveValue(stamp);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await signOut(page);
  const me = await context.request.get("/api/trpc/me.get");
  expect(me.status(), "a protected call after sign-out").toBe(401);
});

test("a ticket already used signs nobody in again", async ({ context, page }) => {
  test.skip(!BY_TICKET, "no tickets were given: the sign-in is by Clerk's test code");
  await passTheWall(context);
  const answer = await redeem(page, ADMIN_TICKET);
  expect(answer.signedIn, "the admin's ticket, a second time").toBe(false);
  const me = await context.request.get("/api/trpc/me.get");
  expect(me.status(), "a protected call after a spent ticket").toBe(401);
});

test("a worker signs in and is refused the office", async ({ context, page }) => {
  await passTheWall(context);
  await signIn(page, WORKER_PHONE, WORKER_TICKET);
  expect(await companyOf(context), "the worker's company is the admin's").toBe(
    adminCompany,
  );

  await page.goto("/customers");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);

  await signOut(page);
});
