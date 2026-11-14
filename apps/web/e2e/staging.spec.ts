// The staging acceptance flow, in a real browser against a protected preview: the wall, an
// admin's sign-in through Clerk, one fixture customer rewritten and read back, sign-out, and
// a worker refused the office. Identities are Clerk's fictional numbers (code 424242, nothing
// is sent) and must already be on the staging roster. The flow writes one customer row and
// rewrites it on every run; it deletes nothing (RULES, Toolbox: cleanup is destructive).
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? "+14015550100";
const WORKER_PHONE = process.env.E2E_WORKER_PHONE ?? "+14015550101";
const CLERK_TEST_CODE = "424242";
const FIXTURE_CUSTOMER = "E2E Customer";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

// The bypass is sent once, to the preview alone, and answered with a cookie the browser then
// carries. A header on every request would hand the secret to Clerk's hosts as well.
async function passTheWall(context: BrowserContext): Promise<void> {
  const ready = await context.request.get("/api/ready", {
    headers: {
      "x-vercel-protection-bypass": BYPASS,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect(ready.status(), "readiness behind the wall").toBe(200);
}

// Clerk's own form: the number, Continue, then the six-digit code, which submits itself.
async function signIn(page: Page, phone: string): Promise<void> {
  await page.goto("/sign-in");
  const identifier = page.locator('input[name="identifier"]');
  await identifier.waitFor({ state: "visible", timeout: 60_000 });
  // The field shows a country code of its own: type the national number.
  await identifier.fill(phone.replace(/^\+1/, ""));
  // Enter straight after the last digit is refused as an invalid identifier; the button a
  // moment later is not (MEMORY, Notes).
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const code = page.locator('input[autocomplete="one-time-code"]').first();
  await code.waitFor({ state: "visible", timeout: 30_000 });
  await code.pressSequentially(CLERK_TEST_CODE, { delay: 80 });
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 60_000,
  });
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

test("the preview is behind Vercel's wall, and ready behind it", async ({
  playwright,
  context,
  baseURL,
}) => {
  const outsider = await playwright.request.newContext({ baseURL });
  const refused = await outsider.get("/api/ready", { maxRedirects: 0 });
  expect([401, 302, 303, 307], "no bypass, no entry").toContain(refused.status());
  await outsider.dispose();
  await passTheWall(context);
});

test("an admin signs in, rewrites the fixture customer, and signs out", async ({
  context,
  page,
}) => {
  await passTheWall(context);
  await signIn(page, ADMIN_PHONE);

  await page.goto("/roster");
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

  const stamp = `e2e ${new Date().toISOString()}`;
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill(stamp);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Read back from the server, not from the form's own state.
  await page.reload();
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Notes")).toHaveValue(stamp);

  await signOut(page);
  const me = await context.request.get("/api/trpc/me.get");
  expect(me.status(), "a protected call after sign-out").toBe(401);
});

test("a worker signs in and is refused the office", async ({ context, page }) => {
  await passTheWall(context);
  await signIn(page, WORKER_PHONE);

  await page.goto("/customers");
  await expect(page.getByText("Not permitted.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add customer" })).toHaveCount(0);

  await signOut(page);
});
