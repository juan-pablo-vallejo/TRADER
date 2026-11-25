// The command menu's list, as arithmetic: what can be jumped to or run, and which of it a
// typed query finds. Everything is a place in the office: a person's panel, a job's page,
// a customer's panel, an invoice, or a screen asked to open one of its own forms
// (`?do=`, use-url-filters.ts). The lists are the ones the office already holds; nothing
// here asks the server anything. Pure.
import type { Catalog } from "./i18n/en";

export type Kind = "action" | "person" | "job" | "customer" | "invoice";
export type Item = {
  id: string;
  kind: Kind;
  // What is typed against and shown.
  label: string;
  // A second, quieter line: whose job, which customer.
  detail: string;
  href: string;
};

// What a screen is asked to open, by name in the address.
export const ASKS = {
  shift: "/schedule?do=shift",
  invoice: "/invoices?do=invoice",
  invite: "/people?do=invite",
  export: "/hours?do=export",
} as const;

type Lists = {
  people?: readonly { id: string; name: string; deactivatedAt: Date | null }[];
  jobs?: readonly { id: string; name: string; customer: { name: string } }[];
  customers?: readonly { id: string; name: string }[];
  invoices?: readonly {
    id: string;
    number: number | null;
    customer: { name: string };
    job: { name: string };
  }[];
};

export function itemsOf(t: Catalog, lists: Lists): Item[] {
  const s = t.command;
  const action = (name: keyof typeof ASKS): Item => ({
    id: `action-${name}`,
    kind: "action",
    label: s.actions[name],
    detail: "",
    href: ASKS[name],
  });
  return [
    action("shift"),
    action("invoice"),
    action("invite"),
    action("export"),
    ...(lists.people ?? []).map((p): Item => ({
      id: `person-${p.id}`,
      kind: "person",
      label: p.name,
      detail: p.deactivatedAt === null ? "" : s.inactive,
      href: `/people?person=${p.id}`,
    })),
    ...(lists.jobs ?? []).map((j): Item => ({
      id: `job-${j.id}`,
      kind: "job",
      label: j.name,
      detail: j.customer.name,
      href: `/jobs/${j.id}`,
    })),
    ...(lists.customers ?? []).map((c): Item => ({
      id: `customer-${c.id}`,
      kind: "customer",
      label: c.name,
      detail: "",
      href: `/customers?customer=${c.id}`,
    })),
    ...(lists.invoices ?? []).map((i): Item => ({
      id: `invoice-${i.id}`,
      kind: "invoice",
      label: i.number === null ? t.invoices.states.draft : t.invoices.invoiceNo(i.number),
      detail: `${i.customer.name} · ${i.job.name}`,
      href: `/invoices/${i.id}`,
    })),
  ];
}

// Typed as it comes: case and accents do not matter, so "pena" finds Peña.
export const folded = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const SHOWN = 12;

// What a query finds, best first. Nothing typed is the four actions. Otherwise every
// typed word must be somewhere in the item's words; an item whose own name starts with
// what was typed comes before one where a later word does, and that before one found by
// its second line alone. Ties keep the list's order: actions, people, jobs, customers,
// invoices.
export function search(items: readonly Item[], query: string, limit = SHOWN): Item[] {
  const typed = folded(query);
  if (typed === "") return items.filter((i) => i.kind === "action").slice(0, limit);
  const words = typed.split(/\s+/);
  const ranked: { item: Item; rank: number; at: number }[] = [];
  for (const [at, item] of items.entries()) {
    const label = folded(item.label);
    const all = `${label} ${folded(item.detail)}`;
    if (!words.every((w) => all.includes(w))) continue;
    const rank = label.startsWith(typed)
      ? 0
      : label.split(/\s+/).some((part) => part.startsWith(words[0]!))
        ? 1
        : label.includes(words[0]!)
          ? 2
          : 3;
    ranked.push({ item, rank, at });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .slice(0, limit)
    .map((r) => r.item);
}

// The option the arrows land on: round the ends, and nowhere when the list is empty.
export const stepped = (active: number, by: 1 | -1, count: number) =>
  count === 0 ? 0 : (active + by + count) % count;
