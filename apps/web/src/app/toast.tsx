"use client";

// A toast: one line that says what was just done, with one action (Undo), gone by itself
// after a few seconds. It waits while the pointer or the focus is on it, so nobody loses
// the action while reaching for it. Announced politely; never the only place a refusal is
// said. Consumed by the Schedule.
import { useEffect, useState } from "react";

import controls from "./controls.module.css";
import styles from "./toast.module.css";

export const TOAST_MS = 7000;

export function Toast({
  text,
  action,
  onAction,
  onDone,
}: {
  text: string;
  action: string;
  onAction: () => void;
  onDone: () => void;
}) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [held, onDone]);
  return (
    <div
      className={styles.toast}
      role="status"
      data-toast
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span className="body">{text}</span>
      <button type="button" className={controls.secondary} onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
