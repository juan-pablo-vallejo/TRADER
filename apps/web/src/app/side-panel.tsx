"use client";

// The side panel: one thing's details, or one form, over the screen that asked. A native
// `<dialog>` opened modal, so the page behind is inert, Tab stays inside, and Escape
// closes it. Focus goes back to what opened it when it closes: the cell, the shift, the
// button. Whether a panel is open is the screen's to keep, in the address where a panel
// should be linkable (use-url-filters.ts). Lifted from the schedule's drawer; consumed by
// the Schedule and Hours screens.
import { useEffect, useId, useRef, type ReactNode } from "react";

import controls from "./controls.module.css";
import { useStrings } from "./i18n";
import styles from "./side-panel.module.css";

export function SidePanel({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  // Room for a table of entries; the default is a form's width.
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useStrings();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    // What had the focus is what opened the panel: it gets the focus back.
    const opener = document.activeElement;
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
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
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
