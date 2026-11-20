"use client";

// The schedule's drawer: an open drawer's overlay covers the whole
// page behind it, the navigation included. A native modal <dialog>: the browser puts it in
// the top layer over everything, its backdrop is the overlay, focus stays inside it, Escape
// closes it and focus returns to what opened it. Wide, a panel on the
// right; narrow, the whole screen. Consumed by shift-dialog.tsx and copy-dialog.tsx.
import { useEffect, useId, useRef, type ReactNode } from "react";

import controls from "../../controls.module.css";
import { useStrings } from "../../i18n";
import styles from "./schedule.module.css";

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useStrings();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    // No cleanup: closing here would fire `close` and report a dismissal nobody made when
    // React mounts an effect twice in development. Unmounting removes the dialog.
    dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby={titleId}
      // Escape: the browser closes the dialog; the screen forgets the panel.
      onClose={onClose}
    >
      <div className={styles.drawerHead}>
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
