"use client";

// The command menu: Ctrl or Cmd + K, or the header's button. Type to jump to a person, a
// job, a customer or an invoice, or to run New shift, New invoice, Invite a person or
// Export hours. The lists are the four the office already holds (the same queries its
// screens make, read when the menu opens); nothing is searched on the server
// (command-items.ts).
// Each action is an address (`/schedule?do=shift`, `/invoices?do=invoice`,
// `/people?do=invite`, `/hours?do=export`), so it can be linked to. The menu holds at most
// the 500 newest invoices, which is all `invoice.list` answers. The header's button reads
// "Ctrl K" on every machine; on a Mac Cmd+K works too.
//
// A text field that is a `combobox` over a `listbox`, inside a native modal `<dialog>`:
// the browser keeps Tab inside, closes it on Escape and makes the page behind inert. No
// library: looked up 2026-11-20, cmdk 1.1.1 brings four Radix packages, a dialog among
// them, for what the platform's dialog and some sixty lines here already do, and this
// office's style policy allows no inline style where Clerk is not the identity. Mounted
// by header.tsx.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { itemsOf, search, stepped, type Item } from "./command-items";
import styles from "./command-menu.module.css";
import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import { useTRPC } from "./trpc";

function Menu({ onClose }: { onClose: () => void }) {
  const { t } = useStrings();
  const s = t.command;
  const trpc = useTRPC();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const people = useQuery(trpc.roster.list.queryOptions());
  const jobs = useQuery(trpc.job.list.queryOptions());
  const customers = useQuery(trpc.customer.list.queryOptions());
  const invoices = useQuery(trpc.invoice.list.queryOptions());
  const items = useMemo(
    () =>
      itemsOf(t, {
        people: people.data,
        jobs: jobs.data,
        customers: customers.data,
        invoices: invoices.data?.items,
      }),
    [t, people.data, jobs.data, customers.data, invoices.data?.items],
  );
  const found = search(items, query);
  const loading = [people, jobs, customers, invoices].some((q) => q.isPending);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  const run = (item: Item | undefined) => {
    if (item === undefined) return;
    onClose();
    router.push(item.href);
  };
  const optionId = (item: Item) => `${listId}-${item.id}`;
  const current = found[Math.min(active, found.length - 1)];

  return (
    <dialog
      ref={ref}
      className={styles.menu}
      data-command
      aria-label={s.title}
      onClose={onClose}
      // A press on the backdrop is a press on the dialog itself, outside its box.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.box}>
        <label className="label" htmlFor={`${listId}-input`}>
          {s.title}
        </label>
        <input
          id={`${listId}-input`}
          className={controls.input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current === undefined ? undefined : optionId(current)}
          autoComplete="off"
          spellCheck={false}
          placeholder={s.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) =>
                stepped(
                  Math.min(a, Math.max(found.length - 1, 0)),
                  e.key === "ArrowDown" ? 1 : -1,
                  found.length,
                ),
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(current);
            }
          }}
        />
        <ul id={listId} role="listbox" aria-label={s.results} className={styles.list}>
          {found.map((item) => (
            <li
              key={item.id}
              id={optionId(item)}
              role="option"
              aria-selected={item === current}
              className={styles.option}
              // The field keeps the focus: a press must not take it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item)}
            >
              <span className={`label ${styles.kind}`}>{s.kinds[item.kind]}</span>
              <span className="body">{item.label}</span>
              {item.detail !== "" && <span className="secondary">{item.detail}</span>}
            </li>
          ))}
        </ul>
        <p className={`secondary ${styles.foot}`} role="status">
          {found.length === 0
            ? loading
              ? t.loading
              : s.none
            : loading
              ? t.loading
              : s.hint}
        </p>
      </div>
    </dialog>
  );
}

export function CommandMenu() {
  const { t } = useStrings();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      if (event.altKey || event.shiftKey) return;
      // Over another panel it would be a second modal: that panel is finished first.
      const other = document.querySelector("dialog[open]:not([data-command])");
      if (other !== null) return;
      event.preventDefault();
      setOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {/* Before the button, so the account is always what follows it (the stylesheet's
          `.opener + *`); a modal dialog is drawn in the top layer wherever it stands. */}
      {open && <Menu onClose={() => setOpen(false)} />}
      <button
        type="button"
        className={`${controls.secondary} ${styles.opener}`}
        aria-label={t.command.title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span>{t.command.open}</span>
        <kbd className={styles.cap} aria-hidden="true">
          Ctrl K
        </kbd>
      </button>
    </>
  );
}
