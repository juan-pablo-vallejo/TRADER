// Every screen, panel, dialog and state of the office, the public pages and sign-in, with
// how each is reached: the one catalogue the look harness (look.shots.ts), the gates'
// spec (screens.local.ts) and the sweep's web cells read. An entry is reached from a fresh
// page: sign in as `as`, open `path`, then `open` if it has one. `state` names how the
// network is held for it; `writes` marks one that changes the demo data, which is rebuilt
// before every run. Words to click are the catalogue's own, so an entry reaches the same
// thing in either language.
import type { Page } from "@playwright/test";

import { en, type Catalog } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";

export type Lang = "en" | "es";
export const CATALOGS: Record<Lang, Catalog> = { en, es };

// Who a page is opened as. `empty` is the admin of a company with nothing else in it,
// which the harness's own preparation writes (look-prepare.ts).
export type As = "admin" | "worker" | "empty" | null;
export const EMAILS: Record<Exclude<As, null>, string> = {
  admin: "office@demo.invalid",
  worker: "luis.herrera@demo.invalid",
  empty: "empty@look.invalid",
};

// `first-load`: every API answer held, so the placeholders show. `failure`: every API
// request refused at the network, so the failure state shows.
export type State = "first-load" | "failure";

export type Area = "public" | "auth" | "office";

export type Entry = {
  name: string;
  area: Area;
  path: string;
  as: As;
  state?: State;
  writes?: boolean;
  // Only where the layout has it: the menu button exists below 768 px alone.
  narrowOnly?: boolean;
  open?: (page: Page, t: Catalog) => Promise<void>;
  // After its picture: puts back what `open` changed, so the next cell finds it again.
  after?: (page: Page, t: Catalog) => Promise<void>;
};

const main = (page: Page) => page.getByRole("main");

// Opens the first row's own panel: a row's first button inside the table.
const firstRowButton = async (page: Page) => {
  await main(page).getByRole("table").getByRole("button").first().click();
  await page.getByRole("dialog").waitFor();
};

const firstLink = async (page: Page, prefix: string) => {
  const href = await main(page)
    .locator(`a[href^="${prefix}"]`)
    .first()
    .getAttribute("href");
  if (href === null) throw new Error(`no link under ${prefix}`);
  await page.goto(href);
  await main(page).getByRole("heading", { level: 1 }).waitFor();
};

const shiftCard = (page: Page) => main(page).getByRole("button", { name: /\d:\d{2}/ });

// The demo holds no invoice, so the first entry that needs one issues it: a draft for the
// first job, one line, issued. Later entries on the same page reopen it.
const issued = new WeakMap<Page, string>();
async function issuedInvoice(page: Page, t: Catalog): Promise<void> {
  const known = issued.get(page);
  if (known !== undefined) {
    await page.goto(known);
    await main(page).getByRole("heading", { level: 1 }).waitFor();
    return;
  }
  const s = t.invoices;
  await page.goto("/invoices?do=invoice");
  const form = page.getByRole("form", { name: s.newDraft });
  await form.locator("select").selectOption({ index: 1 });
  await form.locator('button[type="submit"]').click();
  await page.waitForURL((url) => /^\/invoices\/[0-9a-f-]{36}$/.test(url.pathname));
  await page.getByRole("button", { name: s.addLine }).click();
  await page.getByLabel(s.description).fill("Walls, two coats");
  await page.getByLabel(s.quantity).fill("10");
  await page.getByLabel(s.price).fill("50.00");
  await page.getByRole("button", { name: s.save }).click();
  await page.getByText(s.saved).waitFor();
  await page.getByRole("button", { name: s.issue }).click();
  await page.getByRole("button", { name: s.issue }).last().click();
  await page.getByRole("button", { name: s.recordPayment }).waitFor();
  issued.set(page, new URL(page.url()).pathname);
}

const OFFICE = ["today", "schedule", "hours", "jobs", "customers", "invoices", "people"];

export const SCREENS: readonly Entry[] = [
  // Public, D'Sierra's own pages.
  { name: "home", area: "public", path: "/", as: null },
  { name: "get", area: "public", path: "/get", as: null },
  { name: "privacy", area: "public", path: "/privacy", as: null },
  { name: "terms", area: "public", path: "/terms", as: null },

  // Sign-in's frame: seen only on a server with neither Clerk nor the development
  // identity (look.local.config.ts, LOOK_PASS=frame).
  { name: "sign-in", area: "auth", path: "/sign-in", as: null },

  // The office's screens, as the demo's admin.
  ...OFFICE.map((s): Entry => ({ name: s, area: "office", path: `/${s}`, as: "admin" })),
  { name: "settings", area: "office", path: "/settings", as: "admin" },
  {
    name: "job",
    area: "office",
    path: "/jobs?status=all",
    as: "admin",
    open: (page) => firstLink(page, "/jobs/"),
  },
  {
    name: "invoice",
    area: "office",
    path: "/invoices",
    as: "admin",
    writes: true,
    open: issuedInvoice,
  },

  // The shell.
  {
    name: "shell-nav-open",
    area: "office",
    path: "/today",
    as: "admin",
    narrowOnly: true,
    open: async (page) => {
      await page.locator('nav button[aria-controls="office-nav"]').click();
    },
  },
  {
    name: "shell-command",
    area: "office",
    path: "/today",
    as: "admin",
    open: async (page) => {
      await page.keyboard.press("Control+k");
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "shell-account",
    area: "office",
    path: "/today",
    as: "admin",
    open: async (page) => {
      await page.locator("header details summary").click();
    },
  },
  {
    name: "shell-keys",
    area: "office",
    path: "/jobs",
    as: "admin",
    open: async (page) => {
      // The keys belong to the table: the focus is in it first.
      await main(page).getByRole("table").locator("a, button").first().focus();
      await page.keyboard.press("?");
      await page.getByRole("dialog").waitFor();
    },
  },
  { name: "shell-404", area: "office", path: "/profile", as: "admin" },
  { name: "worker-office", area: "office", path: "/today", as: "worker" },

  // Panels and dialogs.
  {
    name: "schedule-shift-new",
    area: "office",
    path: "/schedule?do=shift",
    as: "admin",
    open: async (page) => {
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "schedule-shift-panel",
    area: "office",
    path: "/schedule",
    as: "admin",
    open: async (page) => {
      await shiftCard(page).first().click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "schedule-copy",
    area: "office",
    path: "/schedule",
    as: "admin",
    open: async (page, t) => {
      await page.getByRole("button", { name: t.schedule.copyLastWeek }).first().click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "schedule-toast-undo",
    area: "office",
    path: "/schedule",
    as: "admin",
    writes: true,
    open: async (page, t) => {
      const cards = shiftCard(page);
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        await cards.nth(i).click();
        const panel = page.getByRole("dialog");
        const remove = panel.getByRole("button", { name: t.schedule.remove });
        if ((await remove.count()) > 0) {
          await remove.click();
          await page.locator("[data-toast]").waitFor();
          return;
        }
        await panel.getByRole("button", { name: t.close, exact: true }).click();
      }
      throw new Error("no shift could be removed");
    },
    after: async (page, t) => {
      await page
        .locator("[data-toast]")
        .getByRole("button", { name: t.schedule.undo })
        .click();
      await page.getByText(t.schedule.undoneChange).waitFor();
    },
  },
  {
    name: "hours-day-panel",
    area: "office",
    path: "/hours?range=last",
    as: "admin",
    open: firstRowButton,
  },
  {
    name: "hours-export",
    area: "office",
    path: "/hours?do=export",
    as: "admin",
    open: async (page) => {
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "jobs-panel",
    area: "office",
    path: "/jobs",
    as: "admin",
    open: firstRowButton,
  },
  {
    name: "jobs-add",
    area: "office",
    path: "/jobs",
    as: "admin",
    open: async (page, t) => {
      await page.getByRole("button", { name: t.addJob }).first().click();
    },
  },
  {
    name: "customers-panel",
    area: "office",
    path: "/customers",
    as: "admin",
    open: firstRowButton,
  },
  {
    name: "customers-add",
    area: "office",
    path: "/customers",
    as: "admin",
    open: async (page, t) => {
      await page.getByRole("button", { name: t.addCustomer }).first().click();
    },
  },
  {
    name: "invoices-new",
    area: "office",
    path: "/invoices?do=invoice",
    as: "admin",
    open: async (page, t) => {
      await page.getByRole("form", { name: t.invoices.newDraft }).waitFor();
    },
  },
  {
    name: "invoice-payment",
    area: "office",
    path: "/invoices",
    as: "admin",
    writes: true,
    open: async (page, t) => {
      await issuedInvoice(page, t);
      await page.getByRole("button", { name: t.invoices.recordPayment }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  {
    name: "people-invite",
    area: "office",
    path: "/people?do=invite",
    as: "admin",
  },
  {
    name: "people-panel",
    area: "office",
    path: "/people",
    as: "admin",
    open: firstRowButton,
  },

  // States.
  {
    name: "settings-saved",
    area: "office",
    path: "/settings",
    as: "admin",
    writes: true,
    open: async (page, t) => {
      await page.getByRole("button", { name: t.settings.saveCompany }).click();
      await page.getByRole("status").filter({ hasText: /\S/ }).first().waitFor();
    },
  },
  {
    name: "people-invite-refused",
    area: "office",
    path: "/people?do=invite",
    as: "admin",
    // A number the server refuses, said under its field.
    open: async (page) => {
      await page.locator("#invite-name").fill("Look Refusal");
      await page.locator("#invite-phone").fill("123");
      await page.locator("#invite-phone").press("Enter");
      await page.locator('#invite-phone[aria-invalid="true"]').waitFor();
    },
  },
  ...OFFICE.map((s): Entry => ({
    name: `${s}-empty`,
    area: "office",
    path: `/${s}`,
    as: "empty",
  })),
  ...["today", "schedule", "hours", "jobs", "invoices", "people"].flatMap(
    (s): Entry[] => [
      {
        name: `${s}-first-load`,
        area: "office",
        path: `/${s}`,
        as: "admin",
        state: "first-load",
      },
      {
        name: `${s}-failure`,
        area: "office",
        path: `/${s}`,
        as: "admin",
        state: "failure",
      },
    ],
  ),
];
