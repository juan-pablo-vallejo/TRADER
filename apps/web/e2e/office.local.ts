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
  // The development server compiles the invoice page on its first visit, which has taken
  // longer than 30 s while the rest of the suite's pages were compiling.
  const opened = await page
    .waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname), {
      timeout: 90_000,
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

test("Ctrl or Cmd+Z brings back a removed shift while another shift's panel is open", async ({
  page,
}) => {
  const wrong = watch(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/schedule");
  // A shift's card is named with its hours; a started shift's panel offers no Remove.
  const cards = page.getByRole("main").getByRole("button", { name: /\d:\d{2}/ });
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  let removed = false;
  for (let i = count - 1; i >= 0 && !removed; i--) {
    await cards.nth(i).click();
    const panel = page.getByRole("dialog");
    const remove = panel.getByRole("button", { name: "Remove shift" });
    if (await remove.isVisible()) {
      await remove.click();
      removed = true;
    } else {
      await panel.getByRole("button", { name: "Close" }).click();
    }
  }
  expect(removed, "a shift that can be removed").toBe(true);
  await expect(page.getByText(/shift on .* removed\./)).toBeVisible();
  await expect(cards).toHaveCount(count - 1);

  // Another shift's panel now covers the page; Undo still answers the keyboard.
  await cards.first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Undone: the shift is as it was.")).toBeVisible();
  await expect(cards).toHaveCount(count);
  expect(wrong, "nothing went wrong").toEqual([]);
});

test("Undo by keyboard leaves the focus on the shift that came back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/schedule");
  const cards = page.getByRole("main").getByRole("button", { name: /\d:\d{2}/ });
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  for (let i = count - 1; i >= 0; i--) {
    await cards.nth(i).click();
    const remove = page.getByRole("dialog").getByRole("button", { name: "Remove shift" });
    if (await remove.isVisible()) {
      await remove.focus();
      await page.keyboard.press("Enter");
      break;
    }
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  }
  // The shift is gone, so the focus went to Undo.
  const undo = page.locator("[data-toast]").getByRole("button", { name: "Undo" });
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Undone: the shift is as it was.")).toBeVisible();
  await expect(cards).toHaveCount(count);
  await expect(page.locator("[data-shift]:focus")).toHaveCount(1);
});

test("a write button keeps the focus through its write", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto("/settings");
  const save = page.getByRole("button", { name: "Save company" });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved.").first()).toBeVisible();
  await expect(save).toBeFocused();
});

test("Schedule keeps its week through a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/schedule");
  const range = page.getByRole("main").locator("p[aria-live]").first();
  await expect(range).toBeVisible();
  const thisWeek = await range.textContent();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(range).not.toHaveText(thisWeek ?? "");
  const nextWeek = await range.textContent();
  await page.reload();
  await expect(range).toHaveText(nextWeek ?? "");

  // A person the week does not list filters nothing: the week's rows still show.
  await page.goto("/schedule?who=nobody");
  await expect(page.getByRole("main").getByRole("table")).toBeVisible();
});

test("nothing can be added to the week before while the next one loads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/schedule");
  const grid = page.getByRole("main").getByRole("table");
  await expect(grid).toBeVisible();
  // The next week's answer is held back, so the week before stays on screen meanwhile.
  await page.route("**/api/trpc/**assignment.week**", async (route) => {
    await new Promise((done) => setTimeout(done, 4000));
    await route.continue();
  });
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(grid).toHaveAttribute("aria-busy", "true");
  await expect(
    grid.getByRole("button", { name: /^Add a shift for / }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add shift", exact: true }),
  ).toBeDisabled();
  await expect(grid).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
});

test("a worker is refused the office", async ({ page }) => {
  await signIn(page, WORKER);
  await page.goto("/customers");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);
});
