// The office against the demo data, in a real browser on this machine (local.config.ts).
// Three things the unit tests cannot see and the staging smoke test sees only after a
// deploy: every office screen opens for an admin with nothing thrown and nothing refused;
// a change made in a form is read back from the server; a worker is refused the office.
// The demo database is rebuilt before every run, so what a test writes does not outlive it.
import { expect, test, type Page } from "@playwright/test";

const ADMIN = "office@demo.invalid";
const WORKER = "luis.herrera@demo.invalid";
const FIXTURE_CUSTOMER = "Browser Suite Customer";
// Every screen of the office's menu.
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

  // An address that is no screen is answered inside the office, as not found: that 404 and
  // the browser's line about it are asked for, and anything else is a fault.
  const asked = wrong.length;
  const missing = await page.goto("/profile");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "There is no page at this address." }),
  ).toBeVisible();
  expect(
    wrong
      .splice(asked)
      .filter((w) => !w.startsWith("404 /profile") && !w.includes("status of 404")),
    "/profile: nothing else went wrong",
  ).toEqual([]);

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

test("a shift's new hours, saved in its panel, are said with Undo and the focus on it", async ({
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
    const end = page.getByRole("dialog").getByLabel("End");
    if (await end.isEditable()) {
      await end.fill("16:15");
      await page.getByRole("dialog").getByRole("button", { name: "Save shift" }).click();
      break;
    }
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  }
  const toast = page.locator("[data-toast]");
  await expect(toast.getByText(/changed to .*4:15\sPM/)).toBeVisible();
  await expect(toast.getByRole("button", { name: "Undo" })).toBeFocused();
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
  await page.route("**/api/trpc/**shift.week**", async (route) => {
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

// A read that fails behind rows already on screen: every later read answers 500, the
// clock moves past the 30 s a list stays fresh, and the tab is shown again, which is when
// TanStack Query refetches.
async function failTheNextRefresh(page: Page): Promise<void> {
  await page.route("**/api/trpc/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
      : route.continue(),
  );
  await page.clock.fastForward("01:00");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test("a failed refresh keeps the rows on Today, Schedule, Hours, an invoice and a day", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  // The invoice made by the first test of this file.
  await page.goto("/invoices");
  const invoice = page.getByRole("main").locator('a[href^="/invoices/"]').first();
  await expect(invoice).toBeVisible();
  const invoiceHref = await invoice.getAttribute("href");

  const screens: { path: string; rows: (p: Page) => ReturnType<Page["locator"]> }[] = [
    {
      path: "/today",
      rows: (p) => p.getByRole("main").getByRole("heading", { level: 2 }).first(),
    },
    { path: "/schedule", rows: (p) => p.getByRole("main").getByRole("table") },
    { path: "/hours?range=last", rows: (p) => p.getByRole("main").getByRole("table") },
    {
      path: invoiceHref ?? "/invoices",
      rows: (p) => p.getByRole("main").getByRole("heading", { level: 1 }),
    },
  ];
  for (const screen of screens) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto(screen.path);
    await expect(screen.rows(page), `${screen.path}: its rows`).toBeVisible();
    await failTheNextRefresh(page);
    await expect(
      page.locator("[data-refresh-failed]"),
      `${screen.path}: the line`,
    ).toBeVisible();
    await expect(screen.rows(page), `${screen.path}: the rows stay`).toBeVisible();
    await expect(page.getByText("This page did not load.")).toHaveCount(0);
  }

  // A day's panel on Hours.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.goto("/hours?range=last");
  await page.getByRole("main").getByRole("table").getByRole("button").first().click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(panel.locator("section")).toBeVisible();
  await failTheNextRefresh(page);
  await expect(panel).toBeVisible();
  await expect(panel.locator("section")).toBeVisible();
});

test("a job's second Create invoice opens the same draft, and each act ends with its sentence", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);

  // A job whose next step is its invoice.
  await page.goto("/jobs?status=all");
  const links = page.getByRole("main").locator('a[href^="/jobs/"]');
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute("href")));
  let jobPath: string | null = null;
  for (const href of hrefs) {
    await page.goto(href!);
    const create = page.getByRole("button", { name: "Create invoice" });
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (await create.isVisible()) {
      jobPath = href;
      break;
    }
  }
  expect(jobPath, "a job waiting for its invoice").not.toBeNull();
  await page.getByRole("button", { name: "Create invoice" }).click();
  await page.waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname), {
    timeout: 90_000,
  });
  const draft = page.url();

  // Back on the job, its draft is opened, not another made.
  await page.goto(jobPath!);
  await page.getByRole("link", { name: "Open its draft" }).click();
  await page.waitForURL(draft);

  // Save, issue: each says so.
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Description").fill("Walls, two coats");
  await page.getByLabel("Quantity").fill("10");
  await page.getByLabel("Price each").fill("50.00");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("button", { name: "Issue invoice" }).last().click();
  await expect(page.getByText(/^Issued as invoice \d+\.$/)).toBeVisible();

  // Void: said on the page that is now the void invoice.
  await page.getByRole("button", { name: "Void invoice" }).click();
  await page.getByRole("button", { name: "Void invoice" }).last().click();
  await expect(page.getByText("Invoice voided.")).toBeVisible();

  // A draft deleted: said on the list it goes back to.
  await page.goto("/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const form = page.getByRole("form", { name: "New invoice" });
  await form.locator("#invoice-job").selectOption({ index: 1 });
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname), {
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Delete draft" }).last().click();
  await page.waitForURL((url) => url.pathname === "/invoices");
  await expect(page.getByText("Draft deleted.")).toBeVisible();

  // A customer added says so.
  await page.goto("/customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page
    .getByRole("form", { name: "Add customer" })
    .getByLabel("Name")
    .fill("Sentence Customer");
  await page
    .getByRole("form", { name: "Add customer" })
    .getByRole("button", { name: "Add customer" })
    .click();
  await expect(page.getByText("Sentence Customer added.")).toBeVisible();
});

test("Hours: Export takes the typed dates, a day line is a full target, a correction survives a reconnect", async ({
  page,
}) => {
  await signIn(page, ADMIN);

  // Export, pressed with dates typed and not shown: the file is for those dates.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/hours");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("From").fill("2026-01-05");
  await page.getByLabel("Through").fill("2026-01-11");
  // The office's buttons keep their shared look: the density's text, radius and cursor.
  const look = await page
    .getByRole("button", { name: "Show these dates" })
    .evaluate((b) => {
      const c = getComputedStyle(b);
      return [c.fontSize, c.cursor, c.borderTopLeftRadius !== "0px"];
    });
  expect(look).toEqual(["15px", "pointer", true]);
  await page.getByRole("button", { name: "Export for payroll" }).click();
  await expect(page.getByRole("dialog").getByText(/Jan 5, 2026/)).toBeVisible();
  await page.keyboard.press("Escape");

  // At phone width each day of a week is a line the height of a target.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/hours?range=last");
  const day = page.getByRole("main").getByRole("table").getByRole("button").first();
  await expect(day).toBeVisible();
  expect((await day.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);

  // A correction being typed in a day's panel is kept through a reconnect.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/hours?range=last");
  await page.getByRole("main").getByRole("table").getByRole("button").first().click();
  const panel = page.getByRole("dialog");
  await panel
    .getByRole("button", { name: /^Correct / })
    .first()
    .click();
  const time = panel.locator('input[type="datetime-local"]').first();
  await expect(time).toBeVisible();
  const typed = (await time.inputValue()).replace(/T\d{2}:\d{2}$/, "T06:15");
  await time.fill(typed);
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await page.waitForTimeout(1500);
  await expect(time).toHaveValue(typed);
});

test("the office for a screen reader: titles, names, row headers, quiet regions, the skip link", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);

  // Each screen names itself.
  for (const [path, title] of [
    ["/today", "Today"],
    ["/schedule", "Schedule"],
    ["/hours", "Hours"],
    ["/jobs", "Jobs"],
    ["/customers", "Customers"],
    ["/invoices", "Invoices"],
    ["/people", "People"],
    ["/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} · TRADER`);
  }

  // A day's cell is named by the figure it shows, then whose and which day; rows have headers.
  await page.goto("/hours?range=last");
  const cell = page.getByRole("main").getByRole("table").getByRole("button").first();
  await expect(cell).toBeVisible();
  const shows = (await cell.evaluate((b) => b.firstChild?.textContent ?? "")).trim();
  expect(shows.length).toBeGreaterThan(0);
  await expect(cell).toHaveAccessibleName(
    new RegExp(`^${shows.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  await expect(page.getByRole("rowheader").first()).toBeVisible();

  // A result note's status region is on the page before its words.
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Save company" })).toBeVisible();
  expect(await page.locator('main [role="status"]:empty').count()).toBeGreaterThan(0);

  // The page's first stop skips to the screen.
  await page.goto("/today");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("focus is placed, the account menu closes, a wrong address keeps the office's header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);

  // Add job opens with the focus in its first field.
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(
    page.getByRole("form", { name: "Add job" }).locator("input, select").first(),
  ).toBeFocused();

  // The account menu closes on a choice and on a press elsewhere.
  await page.goto("/today");
  const name = page.locator("header summary");
  await name.click();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.locator("header details")).not.toHaveAttribute("open", "");
  await name.click();
  await page.getByRole("main").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("header details")).not.toHaveAttribute("open", "");

  // A wrong address is answered inside the office.
  await page.goto("/no-such-screen");
  await expect(page.getByRole("navigation", { name: "Office" })).toBeVisible();
  await expect(page).toHaveTitle("There is no page at this address. · TRADER");
  await expect(
    page.getByRole("heading", { level: 1, name: "There is no page at this address." }),
  ).toBeVisible();
  await expect(page.getByText("There is no page at this address.")).toBeVisible();
});

test("People: Make a worker asks first and not on one's own row; J only acts inside a table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/people");
  const rows = page.getByRole("main").getByRole("table").getByRole("rowheader");
  await expect(rows.first()).toBeVisible();

  // J pressed with the focus outside any table moves nothing.
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("j");
  expect(
    await page.evaluate(() => document.activeElement?.closest("[data-keys]") ?? null),
  ).toBeNull();

  // One's own row offers no change of role.
  const own = (await page.locator("header summary").innerText()).trim();
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`^${own}`) })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByText("Your own role is changed by another admin."),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();

  // Another admin's row: Make a worker says what it takes away before it does it.
  await page
    .getByRole("main")
    .getByRole("table")
    .getByRole("button")
    .filter({ hasNotText: own })
    .first()
    .click();
  const admin = panel.getByRole("button", { name: "Make an admin" });
  if (await admin.isVisible()) {
    await admin.click();
    await panel
      .getByRole("group", { name: "Make an admin" })
      .getByRole("button", { name: "Make an admin" })
      .click();
  }
  await panel.getByRole("button", { name: "Make a worker" }).click();
  await expect(panel.getByText(/will no longer open this office/)).toBeVisible();
});

test("small fixes: a small favicon, job names link, archiving asks, the right captions", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // The favicon is a small icon, not the 2048 px logo.
  const icon = await request.get("/favicon.ico");
  expect((await icon.body()).length).toBeLessThan(8_000);

  await signIn(page, ADMIN);

  // Today names jobs as links to their pages; its money links are filtered.
  await page.goto("/today");
  await expect(page.locator('main a[href^="/jobs/"]').first()).toBeVisible();
  await expect(page.locator('main a[href="/invoices?show=drafts"]')).toBeVisible();

  // A shift's panel links to its job.
  await page.goto("/schedule");
  await page
    .getByRole("main")
    .getByRole("button", { name: /\d:\d{2}/ })
    .first()
    .click();
  const jobLink = page.getByRole("dialog").locator('a[href^="/jobs/"]');
  await expect(jobLink).toBeVisible();
  expect((await jobLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(36);
  // The job's page names the job in its title.
  const jobName = (await jobLink.innerText()).trim();
  await jobLink.click();
  await expect(page).toHaveTitle(`${jobName} · Jobs · TRADER`);
  await page.goto("/schedule");
  await page.keyboard.press("Escape");

  // Archiving a job says what it does before it does it.
  await page.goto("/jobs");
  await page.getByRole("main").getByRole("table").getByRole("button").first().click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Status").selectOption("archived");
  await panel.getByRole("button", { name: "Set status" }).click();
  await expect(panel.getByText(/leaves the phones' job list/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.waitForLoadState("networkidle");

  // Settings says who changes the signed-in admin's email.
  await page.goto("/settings");
  // An admin's own email is changed by TRADER support, not by the office.
  await expect(
    page.getByText("Ask TRADER support to change it: support@jpteq.app").first(),
  ).toBeVisible();
});

test("a worker is refused the office", async ({ page }) => {
  await signIn(page, WORKER);
  await page.goto("/customers");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);
});

// The office in Spanish: the language's cookie, set before the next page is drawn.
async function inSpanish(page: Page): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "trader_lang", value: "es", url: new URL(page.url()).origin }]);
}

test("a required field is refused under it in the office's language, not the browser's bubble", async ({
  page,
}) => {
  await signIn(page, ADMIN);
  await inSpanish(page);
  await page.goto("/customers");
  await page.getByRole("button", { name: "Agregar cliente" }).click();
  const form = page.locator("#create-form");
  await form.getByRole("button", { name: "Agregar cliente" }).click();
  await expect(form.getByText("Completa este campo.")).toBeVisible();
  const name = form.locator("#new-customer-name");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("A");
  await expect(form.getByText("Completa este campo.")).toHaveCount(0);
});

test("a panel opened by its address gives the focus back to its row when it closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/jobs");
  const edit = page.getByRole("main").locator("[data-open]").first();
  await expect(edit).toBeVisible();
  // Named by the word it shows, then the job.
  await expect(edit).toHaveAccessibleName(/^Edit, /);
  const id = await edit.getAttribute("data-open");
  await page.goto(`/jobs?job=${id}`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(`[data-open="${id}"]`)).toBeFocused();
  // The search button's name begins with the word it shows.
  await expect(
    page.locator("header").getByRole("button", { name: /^Search/ }),
  ).toBeVisible();
});

test("at phone width: Correct brings its form into view, Settings holds its room, rows and the header keep their lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, ADMIN);

  // Correct, in a day's panel: the form in view with the focus in its first field.
  await page.goto("/hours?range=last");
  await page.getByRole("main").getByRole("table").getByRole("button").first().click();
  const panel = page.getByRole("dialog");
  await panel
    .getByRole("button", { name: /^Correct/ })
    .first()
    .click();
  const first = panel.locator('form[id^="correct-"]').locator("input, select").first();
  await expect(first).toBeFocused();
  await expect(first).toBeInViewport();
  await page.keyboard.press("Escape");

  // Settings: Me stays where it first stood while Company and Time clock arrive above it.
  await page.route("**/api/trpc/**company.get**", async (route) => {
    await new Promise((done) => setTimeout(done, 3000));
    await route.continue();
  });
  await page.goto("/settings");
  const me = page.locator("#settings-me");
  await expect(me).toBeVisible();
  const before = (await me.boundingBox())?.y ?? 0;
  await expect(page.getByRole("button", { name: "Save company" })).toBeVisible({
    timeout: 15_000,
  });
  const after = (await me.boundingBox())?.y ?? 0;
  expect(Math.abs(after - before)).toBeLessThan(200);
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // The header keeps the person's first name, whole.
  const name = page.locator("header summary");
  await expect(name).toBeVisible();
  expect((await name.innerText()).trim()).not.toContain(" ");
  expect((await name.boundingBox())?.width ?? 0).toBeGreaterThan(40);

  // A name's target is its whole line; a row's Edit is its own line, a target tall.
  await page.goto("/customers");
  const row = page.getByRole("main").locator("tbody tr").first();
  const open = row.locator("td").first().getByRole("button");
  const rowBox = (await row.boundingBox())!;
  const openBox = (await open.boundingBox())!;
  expect(openBox.width).toBeGreaterThan(rowBox.width - 48);
  expect(openBox.height).toBeGreaterThanOrEqual(48);
  await page.goto("/jobs");
  const job = page.getByRole("main").locator("tbody tr").first();
  const editBox = (await job.locator("[data-open]").boundingBox())!;
  const nameBox = (await job.locator("td").first().boundingBox())!;
  expect(editBox.height).toBeGreaterThanOrEqual(48);
  expect(editBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
});

test("at 768: Hours' day lines are a target tall, and a Spanish draft line's fields sit level", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await signIn(page, ADMIN);
  await page.goto("/hours?range=last");
  const line = page.getByRole("main").getByRole("table").locator("tbody td").nth(1);
  await expect(line).toBeVisible();
  expect((await line.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(36);

  await inSpanish(page);
  // A draft: the first test of this file started one.
  await page.goto("/invoices?show=drafts");
  const draft = page.getByRole("main").locator('a[href^="/invoices/"]').first();
  await draft.click();
  await page.waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname));
  await page.getByRole("button", { name: "Agregar una línea" }).click();
  const top = async (label: string) =>
    (await page.getByLabel(label, { exact: true }).last().boundingBox())?.y ?? 0;
  expect(await top("Precio por unidad")).toBe(await top("Descripción"));
});

test("a draft with no lines says why at its foot, and once deleted is not read again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const wrong = watch(page);
  await signIn(page, ADMIN);
  await page.goto("/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const form = page.getByRole("form", { name: "New invoice" });
  await form.locator("#invoice-job").selectOption({ index: 1 });
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname), {
    timeout: 90_000,
  });
  await expect(
    page.getByText("This draft cannot be issued until it has a line."),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("button", { name: "Delete draft" }).last().click();
  await page.waitForURL((url) => url.pathname === "/invoices");
  await page.waitForLoadState("networkidle");
  expect(wrong, "nothing asked of the deleted draft").toEqual([]);
});

test("dates typed into Hours before the page takes over are kept", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, ADMIN);
  // The page's scripts are held back until the dates are typed into its markup.
  let release: () => void = () => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/hours", { waitUntil: "domcontentloaded" });
  await page.locator("#hours-from").fill("2026-01-05");
  await page.locator("#hours-to").fill("2026-01-11");
  release();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#hours-from")).toHaveValue("2026-01-05");
  await expect(page.locator("#hours-to")).toHaveValue("2026-01-11");
});
