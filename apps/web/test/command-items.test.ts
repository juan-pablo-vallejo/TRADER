// The command menu's list (command-items.ts): what can be jumped to or run, where each
// goes, and what a typed query finds, in both languages.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ASKS, folded, itemsOf, search, stepped } from "../src/app/command-items";
import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/app/${path}`, import.meta.url)), "utf8");

const LISTS = {
  people: [
    { id: "p1", name: "Ana Ruiz", deactivatedAt: null },
    { id: "p2", name: "José Peña", deactivatedAt: new Date("2026-10-01T00:00:00Z") },
  ],
  jobs: [
    {
      id: "j1",
      name: "Whitmore exterior repaint",
      customer: { name: "Whitmore Family" },
    },
    { id: "j2", name: "Ana's porch", customer: { name: "Ana Whitmore" } },
  ],
  customers: [{ id: "c1", name: "Whitmore Family" }],
  invoices: [
    {
      id: "i1",
      number: 12,
      customer: { name: "Whitmore Family" },
      job: { name: "Porch" },
    },
    {
      id: "i2",
      number: null,
      customer: { name: "Greenfield" },
      job: { name: "Hallway" },
    },
  ],
};
const ITEMS = itemsOf(en, LISTS);
const found = (query: string) => search(ITEMS, query).map((i) => i.id);

describe("what the menu holds", () => {
  it("offers the four actions first, each a screen asked to open its own form", () => {
    expect(ITEMS.slice(0, 4).map((i) => [i.label, i.href])).toEqual([
      ["New shift", "/schedule?do=shift"],
      ["New invoice", "/invoices?do=invoice"],
      ["Invite a person", "/people?do=invite"],
      ["Export hours", "/hours?do=export"],
    ]);
    expect(itemsOf(es, {}).map((i) => i.label)).toEqual([
      "Turno nuevo",
      "Factura nueva",
      "Invitar a una persona",
      "Exportar horas",
    ]);
  });

  it("jumps to a person's panel, a job's page, a customer's panel and an invoice", () => {
    const href = (id: string) => ITEMS.find((i) => i.id === id)?.href;
    expect(href("person-p1")).toBe("/people?person=p1");
    expect(href("job-j1")).toBe("/jobs/j1");
    expect(href("customer-c1")).toBe("/customers?customer=c1");
    expect(href("invoice-i1")).toBe("/invoices/i1");
    expect(ITEMS.find((i) => i.id === "invoice-i1")).toMatchObject({
      label: "Invoice 12",
      detail: "Whitmore Family · Porch",
    });
    expect(ITEMS.find((i) => i.id === "invoice-i2")?.label).toBe("Draft");
    expect(ITEMS.find((i) => i.id === "person-p2")?.detail).toBe("Deactivated");
  });

  it("is what the screens read: each asked name is one a screen opens", () => {
    const screens: [keyof typeof ASKS, string][] = [
      ["shift", "(office)/schedule/schedule-screen.tsx"],
      ["invoice", "(office)/invoices/invoices-screen.tsx"],
      ["invite", "(office)/people/people-screen.tsx"],
      ["export", "(office)/hours/hours-screen.tsx"],
    ];
    for (const [name, file] of screens) {
      expect([name, read(file).includes(`useAsked("${name}")`)]).toEqual([name, true]);
      expect(ASKS[name].endsWith(`?do=${name}`)).toBe(true);
    }
  });

  it("holds whatever lists have come, and only the actions before any has", () => {
    expect(itemsOf(en, {}).map((i) => i.kind)).toEqual([
      "action",
      "action",
      "action",
      "action",
    ]);
    expect(itemsOf(en, { customers: LISTS.customers }).at(-1)?.id).toBe("customer-c1");
  });
});

describe("what a query finds", () => {
  it("shows the four actions when nothing is typed", () => {
    expect(found("")).toEqual([
      "action-shift",
      "action-invoice",
      "action-invite",
      "action-export",
    ]);
    expect(found("   ")).toHaveLength(4);
  });

  it("finds by any part of a name, whatever the case or the accents", () => {
    expect(found("ana ruiz")).toEqual(["person-p1"]);
    expect(found("RUIZ")).toEqual(["person-p1"]);
    expect(found("pena")).toEqual(["person-p2"]);
    expect(found("José")).toEqual(["person-p2"]);
    expect(folded("  Peña ")).toBe("pena");
  });

  it("puts a name that starts with what was typed first, then a later word, then the second line", () => {
    // "Ana Ruiz" and "Ana's porch" start with it; the invoice has it only in its customer.
    expect(found("ana")).toEqual(["person-p1", "job-j2"]);
    // The job and the customer start with it; the porch job and invoice 12 have it in
    // their second line alone.
    expect(found("whitmore")).toEqual(["job-j1", "customer-c1", "job-j2", "invoice-i1"]);
    expect(found("porch")).toEqual(["job-j2", "invoice-i1"]);
  });

  it("needs every typed word, and finds an action by its words", () => {
    expect(found("whitmore porch")).toEqual(["job-j2", "invoice-i1"]);
    expect(found("whitmore nothing")).toEqual([]);
    expect(found("invoice")).toEqual(["invoice-i1", "action-invoice"]);
    expect(found("new")).toEqual(["action-shift", "action-invoice"]);
    expect(found("export")).toEqual(["action-export"]);
    expect(found("12")).toEqual(["invoice-i1"]);
  });

  it("shows no more than fits, best first", () => {
    const many = itemsOf(en, {
      customers: Array.from({ length: 40 }, (_, i) => ({
        id: `c${i}`,
        name: `Client ${i}`,
      })),
    });
    expect(search(many, "client")).toHaveLength(12);
    expect(search(many, "client", 3).map((i) => i.id)).toEqual([
      "customer-c0",
      "customer-c1",
      "customer-c2",
    ]);
  });

  it("steps round the ends of the list", () => {
    expect(stepped(0, 1, 3)).toBe(1);
    expect(stepped(2, 1, 3)).toBe(0);
    expect(stepped(0, -1, 3)).toBe(2);
    expect(stepped(0, 1, 0)).toBe(0);
  });
});

describe("the menu itself", () => {
  it("is a combobox over a listbox in a native dialog, with no library", () => {
    const menu = read("command-menu.tsx");
    for (const said of [
      'role="combobox"',
      'role="listbox"',
      'role="option"',
      "<dialog",
      "aria-activedescendant",
      "showModal()",
    ]) {
      expect([said, menu.includes(said)]).toEqual([said, true]);
    }
    expect(menu).not.toMatch(/from "cmdk|@radix-ui/);
    expect(read("header.tsx")).toContain("<CommandMenu />");
  });
});
