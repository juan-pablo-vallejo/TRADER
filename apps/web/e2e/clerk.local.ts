// The office's sign-in against Clerk's development instance, in a real browser on this
// machine (clerk.config.ts, run by `scripts/staging.sh local`). What no unit test can see:
// the form only exists where Clerk is the identity, and its every step is Clerk's answer.
// Each test is named for what a person sees.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { clerk, READDRESS_PHONE, readdressLogin } from "./clerk-fixtures";
import { signInByTicket } from "./ticket-session";
import { mintTicket } from "./tickets";

// The sign-in page with Clerk loaded in it: before that, the form has nothing to ask with.
async function openSignIn(page: Page, path = "/sign-in"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 60_000 },
  );
}

// One of the suite's two people signed in by a single-use ticket, made with the development
// instance's key for this run alone: their numbers are asked for no code (Clerk limits and
// locks a number asked too often), and the ticket is never printed.
// On staging (passkey.config.ts) the admin's ticket is made by `scripts/staging.sh` and
// handed over instead: the key stays with the script.
async function signInAs(page: Page, phone: string): Promise<void> {
  const given = phone === ADMIN_PHONE ? (process.env.E2E_ADMIN_TICKET ?? "") : "";
  if (given !== "") {
    expect(await signInByTicket(page, given), "the ticket signs in").toBe(true);
    return;
  }
  const made = await mintTicket(
    { secretKey: process.env.CLERK_SECRET_KEY ?? "", fetch },
    phone,
  );
  if (!made.ok) throw new Error(`no sign-in ticket: ${made.failure}`);
  expect(await signInByTicket(page, made.ticket), "the ticket signs in").toBe(true);
}
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? "";

// The account menu in the office's header, which only a person on a roster is drawn.
const account = (page: Page) => page.getByRole("banner").locator("summary");

// A device's own lock, as Chromium's virtual authenticator: it holds a passkey made on this
// page and answers for it at once, as a laptop's fingerprint reader would.
async function addAuthenticator(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test.describe.configure({ mode: "serial" });

test("Continue with Google leaves for accounts.google.com", async ({ page }) => {
  // Google's page itself is never loaded: that the browser asks for it is the answer.
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  await openSignIn(page);
  const toGoogle = page.waitForRequest(
    (request) => new URL(request.url()).host === "accounts.google.com",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await toGoogle;
});

// An address nobody's login holds, at Clerk's reserved test domain: no mail is ever sent.
const NOBODY = "nobody.invited+clerk_test@example.com";
const NOT_ON_ROSTER = "This sign-in is not on a roster. Ask your office.";

test("an address filled before the script arrives is kept and answered", async ({
  page,
}) => {
  // The page's scripts are held back until the field has been filled, as a slow phone or a
  // password manager fills it before the page is the browser's.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/chunks/**", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/sign-in", { waitUntil: "commit" });
  const field = page.locator("#sign-in-address");
  await field.fill(NOBODY);
  release();
  await page.waitForFunction(
    () => (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded === true,
    undefined,
    { timeout: 60_000 },
  );
  await expect(field).toHaveValue(NOBODY);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.locator("#sign-in-note")).toHaveText(NOT_ON_ROSTER);
});

test("an unknown email is told to ask the office, and so is a Google account nobody holds", async ({
  page,
}) => {
  await openSignIn(page);
  await page.locator("#sign-in-address").fill(NOBODY);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.locator("#sign-in-note")).toHaveText(NOT_ON_ROSTER);
  // Still the first step: nothing was sent, so there is no code to ask for.
  await expect(page.locator("#sign-in-code")).toHaveCount(0);

  // The callback page with no sign-in behind it: back to the form, told it failed and not
  // that the account is unknown, which only Clerk's answer can say; no field is marked.
  await page.goto("/sign-in/sso-callback");
  await page.waitForURL(
    (url) => url.pathname === "/sign-in" && url.search.includes("refused"),
  );
  await expect(page.locator("#sign-in-note")).toHaveText(
    "That did not work. Check your connection and try again.",
  );
  await expect(page.locator("#sign-in-address")).toHaveAttribute("aria-invalid", "false");
});

test("when Clerk's script never arrives, the form and the Google return say so", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/npm/@clerk/**", (route) => route.abort());
  await page.goto("/sign-in");
  await expect(page.locator("#sign-in-note")).toHaveText(
    "Sign-in could not load. Check your connection, then reload this page.",
    { timeout: 20_000 },
  );
  await page.goto("/sign-in/sso-callback");
  await expect(page.getByText("Sign-in could not load.", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("link", { name: "Back to sign-in" })).toBeVisible();
  await expect(page.getByText("Signing you in…")).toHaveCount(0);
});

test.describe("in Spanish on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "es-US" });

  test("the form is in Spanish at 390 wide, and nothing scrolls sideways", async ({
    page,
  }) => {
    await openSignIn(page);
    await expect(page.getByRole("heading", { name: "Acceso del equipo" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continuar con Google" }),
    ).toBeVisible();
    await page.locator("#sign-in-address").fill(NOBODY);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#sign-in-note")).toHaveText(
      "Este acceso no está en ninguna plantilla. Pregunta en tu oficina.",
    );
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(sideways, "the page is wider than the screen").toBe(false);
  });
});

test("an admin is offered a passkey on Today, signs in with it, and removes it", async ({
  page,
  context,
}) => {
  await addAuthenticator(context, page);
  await signInAs(page, ADMIN_PHONE);
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Passkeys" });
  await expect(section.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  // Whatever an earlier run left behind is cleared first: the run starts from none.
  const removeAll = async () => {
    const remove = section.getByRole("button", { name: "Remove", exact: true });
    while ((await remove.count()) > 0) {
      await remove.first().click();
      await section
        .getByRole("group", { name: "Remove" })
        .getByRole("button", { name: "Remove" })
        .click();
      await expect(section.getByText("Passkey removed.")).toBeVisible();
    }
    await expect(section.getByText("No passkeys yet.")).toBeVisible();
  };
  await removeAll();

  // A ticket's session counts as just signed in (Clerk's factorVerificationAge is [0, -1]),
  // so Today makes the offer it makes after a code.
  await page.goto("/today");
  const band = page.getByRole("region", { name: "Passkeys" });
  await band.getByRole("button", { name: "Add a passkey" }).click();
  await expect(
    band.getByText("Passkey added. Next time, choose Use a passkey."),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(section.getByRole("listitem")).toHaveCount(1);

  await account(page).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in");
  // The button, alone: a browser that offers no passkey in the field (some do not), so the
  // field's own offer, which this authenticator would answer by itself, never starts.
  await page.addInitScript(() => {
    window.PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  await openSignIn(page);
  await page.getByRole("button", { name: "Use a passkey" }).click();
  await page.waitForURL((url) => url.pathname === "/today");
  await expect(account(page)).toBeVisible();

  await page.goto("/settings");
  await expect(section.getByRole("listitem")).toHaveCount(1);
  await removeAll();
});

test("a worker given an email by the office is signed out everywhere", async ({
  page,
  browser,
}) => {
  const name = "Readdress Fixture";
  const email = "readdress.fixture+clerk_test@example.com";
  await signInAs(page, ADMIN_PHONE);
  await page.goto("/people");
  await page.getByRole("button", { name: "Add a person" }).click();
  const form = page.getByRole("form", { name: "Add a person" });
  await form.getByLabel("Mobile number").fill(READDRESS_PHONE.slice(2));
  await form.getByLabel("Name").fill(name);
  await form.getByRole("button", { name: "Add to roster" }).click();
  await expect(
    page.getByText(`${name} is invited. Now tell them where to get the app.`),
  ).toBeVisible();

  // The worker, in a browser of their own. Their first request binds their login to the row.
  const theirs = await browser.newContext();
  const worker = await theirs.newPage();
  await signInAs(worker, READDRESS_PHONE);
  const asks = () =>
    worker.evaluate(async () => (await fetch("/api/trpc/me.get")).status);
  expect(await asks(), "signed in, they are answered").toBe(200);

  const change = async (to: string, done: string) => {
    const panel = page.getByRole("dialog");
    await panel.getByLabel("Email", { exact: true }).fill(to);
    await panel.getByRole("button", { name: "Change the email" }).click();
    await panel
      .getByRole("group", { name: "Change the email" })
      .getByRole("button", { name: "Change the email" })
      .click();
    await expect(panel.getByText(done)).toBeVisible();
  };
  await page.getByRole("button", { name: `Open ${name}` }).click();
  await change(email, "Changed. They are signed out, and sign in with it from now on.");

  // Clerk holds no session of theirs at once. A token already issued is verified without a
  // call to Clerk and lives a minute at most: their next request after it is refused.
  const login = await readdressLogin();
  expect(login, "the suite's login exists").not.toBeNull();
  const live = (await clerk(
    `/sessions?${new URLSearchParams({ user_id: login!.id, status: "active" }).toString()}`,
  )) as unknown[];
  expect(live, "no active session at Clerk").toHaveLength(0);
  await expect.poll(asks, { timeout: 90_000, intervals: [5_000] }).toBe(401);
  await theirs.close();

  // Taken away again, so the next run starts where this one did.
  await change("", "Changed. They are signed out, and sign in with it from now on.");
});
