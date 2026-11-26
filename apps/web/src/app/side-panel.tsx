"use client";

// The side panel: one thing's details, or one form, over the screen that asked. A native
// `<dialog>` opened modal, so the page behind is inert, Tab stays inside, and Escape
// closes it. Focus goes back to what opened it when it closes: the cell, the shift, the
// button; for a record, its own row, the control `returnTo` names (data-table.tsx, `data-open`). Whether a
// panel is open is the screen's to keep, in the address where a panel
// should be linkable (use-url-filters.ts). Lifted from the schedule's drawer; consumed by
// the Schedule and Hours screens.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import controls from "./controls.module.css";
import { rowOpener } from "./data-table";
import { useStrings } from "./i18n";
import styles from "./side-panel.module.css";

export function SidePanel({
  title,
  onClose,
  wide = false,
  returnTo,
  opensAt = "field",
  children,
}: {
  title: string;
  onClose: () => void;
  // Room for a table of entries; the default is a form's width.
  wide?: boolean;
  // The key of the row whose control opens this panel, for a panel opened by its address.
  returnTo?: string;
  // Where the focus lands as it opens: a form's first field, or the top (its Close) for a
  // record read before it is changed, so its title and what it says come first.
  opensAt?: "field" | "top";
  children: ReactNode;
}) {
  const { t } = useStrings();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // What had the focus when the panel opened, kept across a development double mount.
  const opener = useRef<Element | null>(null);
  // Something typed and not yet sent: the first Escape keeps the panel open and says so;
  // a second discards. Close, pressed on purpose, closes.
  const unsaved = useRef(false);
  const [warned, setWarned] = useState(false);
  // The notice is said where it can be seen: a long panel may be scrolled past its top.
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (warned) notice.current?.scrollIntoView({ block: "nearest" });
  }, [warned]);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open) {
      // What had the focus is what opened the panel: it gets the focus back.
      opener.current = document.activeElement;
      // Not closed in the cleanup: closing would fire `close` and report a dismissal nobody
      // made when React mounts an effect twice in development. Unmounting removes the dialog.
      dialog.showModal();
      // The focus goes to what the panel is for: the field a form marks `data-autofocus`,
      // else its first field, else the browser's choice, its Close.
      const field =
        opensAt === "top"
          ? dialog.querySelector<HTMLElement>("[data-close]")
          : (dialog.querySelector<HTMLElement>("[data-autofocus]") ??
            dialog.querySelector<HTMLElement>(
              "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
            ));
      field?.focus();
    }
    // Registered on every mount, the second of a development double mount included, so the
    // focus goes back however the panel was mounted.
    return () => {
      const back = () => {
        // A record's own row comes first: a panel opened by its address has no opener, and
        // the page may have put the focus anywhere as it loaded.
        const row = returnTo === undefined ? null : rowOpener(returnTo);
        const was = opener.current;
        if (row !== null) row.focus();
        else if (was instanceof HTMLElement && was.isConnected && was !== document.body)
          was.focus();
      };
      // Two frames after the close, and only if nothing holds the focus then: the router may
      // drop it as the address is rewritten, and what the screen focused meanwhile keeps it.
      // A change the panel made says so in a toast whose Undo takes the focus a frame after
      // it appears (toast.tsx); the second frame lets it go first.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const now = document.activeElement;
          if (now === null || now === document.body) back();
        }),
      );
    };
    // Once, as the panel opens: what it returns to is fixed then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Whether a close is held once, to say what would be lost: something typed and not sent,
  // a refusal still on the panel (what was sent is still there, unsaved), or a date or time
  // field holding the focus, whose change a keyboard makes in place and may not have said.
  const holds = (dialog: HTMLDialogElement): boolean => {
    if (warned) return false;
    const refused =
      dialog.querySelector('[aria-invalid="true"], [role="alert"]') !== null;
    const active = document.activeElement;
    const midTime =
      active instanceof HTMLInputElement &&
      dialog.contains(active) &&
      ["date", "time", "datetime-local"].includes(active.type);
    if (!unsaved.current && !refused && !midTime) return false;
    setWarned(true);
    return true;
  };
  // What is typed, or a date or a time changed (which says so by `change` alone), is what
  // a stray Escape would lose; a choice in a list, a box or a switch is made again in a
  // moment.
  const typedIn = (target: EventTarget) => {
    const typed =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["checkbox", "radio"].includes(target.type));
    if (!typed) return;
    unsaved.current = true;
    setWarned(false);
  };
  return (
    <dialog
      ref={ref}
      className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}
      aria-labelledby={titleId}
      // Escape: the browser closes the dialog; the screen forgets the panel.
      onClose={onClose}
      // Escape is caught as a key, before the browser acts on it: from inside a date or
      // time field Chrome closes the dialog without a `cancel` to stop. `onCancel` stays
      // for whatever else asks the dialog to close.
      onKeyDownCapture={(e) => {
        if (e.key !== "Escape") return;
        if (holds(e.currentTarget)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onCancel={(e) => {
        if (holds(e.currentTarget)) e.preventDefault();
      }}
      onChange={(e) => typedIn(e.target)}
      onInput={(e) => typedIn(e.target)}
      onSubmit={() => {
        unsaved.current = false;
      }}
    >
      <div className={styles.head}>
        <h2 id={titleId} className="heading">
          {title}
        </h2>
        <button type="button" className={controls.secondary} onClick={onClose} data-close>
          {t.close}
        </button>
      </div>
      <div role="status" ref={notice}>
        {warned && (
          <p className={`secondary ${controls.note} ${controls.error}`}>
            {t.unsavedInPanel}
          </p>
        )}
      </div>
      {children}
    </dialog>
  );
}
