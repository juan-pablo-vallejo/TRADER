// What the office's screens draw where only the rendered page would otherwise show it,
// read from the files themselves: a refusal under its field instead of the browser's
// bubble, where the focus goes, the stacked row's lines and targets, placeholder rows that
// hold their room, and reads that stop. The browser suite (e2e/office.local.ts) sees the
// same on a page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { refusalOf } from "../src/app/refusal";
import { en } from "../src/app/i18n/en";
import { es } from "../src/app/i18n/es";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/app/${path}`, import.meta.url)), "utf8");
// One CSS rule's body, by its exact selector, from the first occurrence after `from`.
function rule(css: string, selector: string, from = ""): string {
  const start = css.indexOf(from);
  const at = css.indexOf(`${selector} {`, start === -1 ? 0 : start);
  if (at === -1) return "";
  return css.slice(at, css.indexOf("}", at));
}
const NARROW = "@container (max-width: 719px)";

const valid = {
  valueMissing: false,
  typeMismatch: false,
};

describe("a field the browser refuses", () => {
  it("is refused in the office's own words, in the chosen language", () => {
    expect(refusalOf({ ...valid, valueMissing: true }, en)).toBe(en.fieldRefusal.missing);
    expect(refusalOf({ ...valid, valueMissing: true }, es)).toBe(es.fieldRefusal.missing);
    expect(refusalOf({ ...valid, typeMismatch: true }, en)).toBe(en.fieldRefusal.email);
    expect(refusalOf({ ...valid, typeMismatch: true }, es)).toBe(es.fieldRefusal.email);
    expect(refusalOf(valid, es)).toBe(es.fieldRefusal.other);
    expect(es.fieldRefusal.missing).not.toBe(en.fieldRefusal.missing);
  });

  it("is said under the field, with the browser's bubble held back, on every form", () => {
    const field = read("field.tsx");
    expect(field).toContain("onInvalid=");
    expect(field).toContain("preventDefault()");
    expect(field).toContain('role="alert"');
    // Every control an office form marks required is drawn inside a Field. (Customers'
    // name goes through its own `field` helper, which draws one.)
    for (const file of [
      "(office)/settings/settings-screen.tsx",
      "(office)/settings/me-form.tsx",
      "(office)/invoices/invoices-screen.tsx",
      "(office)/invoices/[invoiceId]/invoice-screen.tsx",
      "(office)/schedule/shift-dialog.tsx",
      "(office)/people/people-screen.tsx",
      "(office)/jobs/jobs-screen.tsx",
      "(office)/hours/hours-screen.tsx",
    ]) {
      const source = read(file);
      for (const found of source.matchAll(/\srequired(?=[\s={])/g)) {
        const before = source.slice(0, found.index);
        expect(
          [file, before.lastIndexOf("<Field") > before.lastIndexOf("</Field>")],
          `${file} at ${found.index}`,
        ).toEqual([file, true]);
      }
    }
  });
});

describe("the focus", () => {
  it("goes back to the record's own row when a panel opened by its address closes", () => {
    const panel = read("side-panel.tsx");
    expect(panel).toContain("returnTo");
    expect(read("data-table.tsx")).toContain("data-open=");
    for (const file of [
      "(office)/jobs/jobs-screen.tsx",
      "(office)/customers/customers-screen.tsx",
      "(office)/people/people-screen.tsx",
    ]) {
      expect(read(file), file).toMatch(/<SidePanel\b[\s\S]{0,200}?returnTo=\{/);
    }
  });

  it("goes into a correction's form as it opens, and brings the form into view", () => {
    const day = read("(office)/hours/day-panel.tsx");
    expect(day).toContain("scrollIntoView");
    expect(day.match(/ref=\{revealed\}/g)?.length).toBe(2);
  });
});

describe("Settings", () => {
  it("holds the room of Company and Time clock while they load", () => {
    const screen = read("(office)/settings/settings-screen.tsx");
    // While the person is not known yet, and while the company loads: the same placeholder.
    expect(screen).toMatch(/me\.isPending \? \([\s\S]{0,200}?<CompanyPlaceholder/);
    expect(screen).toMatch(/company\.isPending\) return <CompanyPlaceholder/);
  });
});

describe("Jobs and a job's page", () => {
  it("names Edit by the word it shows, then the job", () => {
    const jobs = read("(office)/jobs/jobs-screen.tsx");
    expect(jobs).toMatch(
      /key: "edit",[\s\S]{0,300}?open: \(row\) => \(\{ label: row\.name/,
    );
  });

  it("writes a phone number as People does", () => {
    expect(read("(office)/jobs/[jobId]/job-screen.tsx")).toContain(
      "signInPhone(p.person.phone ",
    );
  });
});

describe("a stacked row", () => {
  const css = read("table.module.css");

  it("gives a name's target its whole line, a link and a button alike", () => {
    expect(rule(css, "  .rowLink", NARROW)).toContain("width: auto");
    const name = rule(css, "  .table tr td:first-child .cellOpen", NARROW);
    expect(name).toContain("display: flex");
    expect(name).toContain("width: 100%");
    // Set as Jobs' names are: a link's color.
    expect(name).toContain("color: var(--accent)");
  });

  it("puts a row's Edit on a line of its own, a full target tall", () => {
    expect(read("data-table.tsx")).toContain("table.action");
    expect(read("(office)/jobs/jobs-screen.tsx")).toMatch(
      /key: "edit",[\s\S]{0,300}?action: true/,
    );
    const line = rule(css, "  .table tr td.action", NARROW);
    expect(line).toContain("display: block");
    const button = rule(css, "  .table tr td.action .cellOpen", NARROW);
    expect(button).toContain("min-height: var(--target)");
  });

  it("keeps a middle dot with the cell it introduces", () => {
    for (const file of ["table.module.css", "(office)/people/people.module.css"]) {
      const source = read(file);
      // The space that may break is before the dot; the one after it never breaks.
      expect(source, file).not.toContain('"\\00a0· "');
      expect(source, file).toContain('" ·\\00a0"');
    }
  });

  it("makes a week's day line a target tall at every narrow width", () => {
    const line = rule(
      css,
      "  .table.lines tr td:not(:first-child):not([data-empty])",
      NARROW,
    );
    expect(line).toContain("min-height: var(--target)");
    expect(line).not.toContain("32px");
  });
});

describe("the header at phone width", () => {
  it("keeps the person's first name, and shortens the company's", () => {
    expect(read("account.tsx")).toContain("firstName(me.data.name)");
    const account = read("account.module.css");
    expect(account).toContain(".firstName");
    expect(rule(read("header.module.css"), ".wordmark")).toContain(
      "text-overflow: ellipsis",
    );
  });
});

describe("a draft invoice", () => {
  const screen = read("(office)/invoices/[invoiceId]/invoice-screen.tsx");

  it("says at its foot why it cannot be issued yet", () => {
    expect(screen).toContain("s.noLinesToIssue");
    for (const catalog of [en, es]) {
      expect(catalog.invoices.noLinesToIssue).not.toMatch(/below|abajo/);
    }
  });

  it("sets a line's fields level whatever their labels' length", () => {
    const css = read("(office)/invoices/invoices.module.css");
    expect(rule(css, "  .line", "@media (min-width: 768px)")).toContain(
      "align-items: end",
    );
  });

  it("stops reading itself once its deletion is sent", () => {
    expect(screen).toMatch(
      /invoice\.read\.queryOptions\(\s*\{ invoiceId \},\s*\{ enabled: !deleting \}/,
    );
    expect(screen).toMatch(
      /invoice\.suggest\.queryOptions\(\s*\{ invoiceId: invoice\.id \},\s*\{ enabled: !deleting \}/,
    );
    expect(screen).toMatch(
      /remove\.mutationOptions\(\{\s*onMutate: \(\) => stopReads\(true\)/,
    );
  });
});

describe("Hours' dates", () => {
  it("keep what was typed before the page took over, as sign-in's field does", () => {
    const screen = read("(office)/hours/hours-screen.tsx");
    for (const id of ["hours-from", "hours-to"]) {
      const input = screen.slice(
        screen.indexOf(`id="${id}"`),
        screen.indexOf("/>", screen.indexOf(`id="${id}"`)),
      );
      expect(input, id).toContain("defaultValue=");
      expect(input, id).not.toMatch(/\svalue=/);
    }
    // Typed before then: the field's value is not the one its markup came with.
    expect(screen).toContain(".defaultValue");
  });
});
