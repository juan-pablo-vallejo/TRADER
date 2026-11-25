"use client";

// The side panel: one thing's details, or one form, over the screen that asked. A native
// `<dialog>` opened modal, so the page behind is inert, Tab stays inside, and Escape
// closes it. Focus goes back to what opened it when it closes: the cell, the shift, the
// button; for a record, its own row, the control `returnTo` names (data-table.tsx, `data-open`). Whether a
// panel is open is the screen's to keep, in the address where a panel
// should be linkable (use-url-filters.ts). Lifted from the schedule's drawer; consumed by
// the Schedule and Hours screens.
import { useEffect, useId, useRef, type ReactNode } from "react";

import controls from "./controls.module.css";
import { rowOpener } from "./data-table";
import { useStrings } from "./i18n";
import styles from "./side-panel.module.css";

export function SidePanel({
  title,
  onClose,
  wide = false,
  returnTo,
  children,
}: {
  title: string;
  onClose: () => void;
  // Room for a table of entries; the default is a form's width.
  wide?: boolean;
  // The key of the row whose control opens this panel, for a panel opened by its address.
  returnTo?: string;
  children: ReactNode;
}) {
  const { t } = useStrings();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // What had the focus when the panel opened, kept across a development double mount.
  const opener = useRef<Element | null>(null);
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
        dialog.querySelector<HTMLElement>("[data-autofocus]") ??
        dialog.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
        );
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
      back();
      // Closing also rewrites the address, and the router may move the focus as it
      // navigates: once more after that frame, so the focus ends where it belongs.
      requestAnimationFrame(back);
    };
    // Once, as the panel opens: what it returns to is fixed then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}
      aria-labelledby={titleId}
      // Escape: the browser closes the dialog; the screen forgets the panel.
      onClose={onClose}
    >
      <div className={styles.head}>
        <h2 id={titleId} className="heading">
          {title}
        </h2>
        <button type="button" className={controls.secondary} onClick={onClose}>
          {t.close}
        </button>
      </div>
      {children}
    </dialog>
  );
}
