// The office against the demo data, in a real browser on this machine (local.config.ts).
// Three things the unit tests cannot see and the staging smoke test sees only after a
// deploy: every office screen opens for an admin with nothing thrown and nothing refused;
// a change made in a form is read back from the server; a worker is refused the office.
// The demo database is rebuilt before every run, so what a test writes does not outlive it.
import { expect, test, type Page } from "@playwright/test";

const ADMIN = "office@demo.invalid";
const WORKER = "luis.herrera@demo.invalid";
const FIXTURE_CUSTOMER = "Browser Suite Customer";
// Every screen of the office's menu. `/profile` is an old address that answers with
// Settings, and is asked for once below.
const SCREENS = [
  "/today",
  "/schedule",
  "/hours",
  "/jobs",
  "/customers",
  "/invoices",
  "/people",
  "/settings",
];

// The development sign-in: a form that names an email and lands on the office's home.
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/dev-signin");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/dev-signin"));
}

// What went wrong on a page while it was open: an exception in the page, an error the page
// logged, or an answer of the server's that is a failure.
function watch(page: Page): string[] {
  const wrong: string[] = [];
  page.on("pageerror", (error) => wrong.push(`thrown: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") wrong.push(`logged: ${message.text()}`);
  });
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (response.status() >= 400 && !pathname.startsWith("/_next/")) {
      wrong.push(`${response.status()} ${pathname}`);
    }
  });
  return wrong;
}

test.describe.configure({ mode: "serial" });

test("every office screen opens for an admin, with nothing thrown or refused", async ({
  page,
}) => {
  const wrong = watch(page);
  await signIn(page, ADMIN);
  for (const screen of SCREENS) {
    await page.goto(screen);
    await expect(page.getByRole("heading").first(), `${screen}: a heading`).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname, `${screen}: stays where it was asked for`).toBe(
      screen,
    );
    await expect(page.getByText("Not permitted."), `${screen}: permitted`).toHaveCount(0);
    expect(wrong, `${screen}: nothing went wrong`).toEqual([]);
  }

  await page.goto("/profile");
  await page.waitForURL((url) => url.pathname === "/settings");

  // One job, by the first link to one on the list.
  await page.goto("/jobs");
  const job = page.locator('a[href^="/jobs/"]').first();
  await expect(job, "/jobs: a link to one of them").toBeVisible();
  await job.click();
  await page.waitForURL((url) => /^\/jobs\/[0-9a-f-]{36}$/.test(url.pathname));
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(wrong, "one job: nothing went wrong").toEqual([]);

  // One invoice. The demo has none, so a draft is started for the first job offered: a
  // draft takes no number, and the database is rebuilt before the next run.
  await page.goto("/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const draft = page.getByRole("form", { name: "New invoice" });
  await draft.locator("#invoice-job").selectOption({ index: 1 });
  await draft.locator('button[type="submit"]').click();
  // A refusal shows as a note under the form and no navigation: say what the server said.
  const opened = await page
    .waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname), {
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false);
  expect(opened ? [] : ["the draft did not open", ...wrong], "a draft opens").toEqual([]);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(wrong, "one invoice: nothing went wrong").toEqual([]);
});

test("an admin adds a customer, rewrites their notes, and reads them back", async ({
  page,
}) => {
  const wrong = watch(page);
  await signIn(page, ADMIN);
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await page.getByRole("button", { name: "Add customer" }).click();
  const form = page.getByRole("form", { name: "Add customer" });
  await form.getByLabel("Name").fill(FIXTURE_CUSTOMER);
  await form.getByRole("button", { name: "Add customer" }).click();
  const row = page.getByRole("row").filter({ hasText: FIXTURE_CUSTOMER });
  await expect(row).toHaveCount(1);

  const stamp = `browser suite ${new Date().toISOString()}`;
  await row.getByRole("button", { name: `Open ${FIXTURE_CUSTOMER}` }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Notes").fill(stamp);
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText("Saved.")).toBeVisible();

  // Read back from the server, not from the form's own state.
  await page.reload();
  await expect(page.getByRole("dialog").getByLabel("Notes")).toHaveValue(stamp);
  expect(wrong, "nothing went wrong").toEqual([]);
});

test("a worker is refused the office", async ({ page }) => {
  await signIn(page, WORKER);
  await page.goto("/customers");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);
});
