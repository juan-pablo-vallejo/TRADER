// The row editor (DESIGN, UI components): a table row's Edit toggle and the editor row that
// opens beneath it, plus the two pieces every editor is built from — a section and the footer
// where a destructive button stands last and alone — and the destructive action itself, which
// says what it will do before it does it. Consumed by the roster, customers, jobs and crews
// screens.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import controls from "./controls.module.css";
import { strings } from "./strings";
import table from "./table.module.css";

const editorId = (rowId: string) => `editor-${rowId}`;

export function RowToggle({
  rowId,
  open,
  onToggle,
}: {
  rowId: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <td className={table.toggle}>
      <button
        type="button"
        className={controls.textAction}
        aria-expanded={open}
        aria-controls={editorId(rowId)}
        onClick={onToggle}
      >
        {open ? strings.close : strings.edit}
      </button>
    </td>
  );
}

export function EditorRow({
  rowId,
  colSpan,
  children,
}: {
  rowId: string;
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr className={table.editor} id={editorId(rowId)}>
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}

// A section of an editor; the heading is for a section holding more than one field.
export function EditorSection({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <section className={table.section}>
      {heading !== undefined && <h3 className="body-strong">{heading}</h3>}
      {children}
    </section>
  );
}

export function EditorFooter({ children }: { children: ReactNode }) {
  return <div className={table.footer}>{children}</div>;
}

// A destructive action (DESIGN, principle 5: ceremony matches consequence). The first press
// only shows what will happen, in a sentence, with the action and a way out; the second does
// it. Never a bare "Are you sure?". `quiet` is the text form, for removing one item of a list.
// Focus moves to Cancel, the safe choice, so a held Enter cannot confirm; both buttons are
// described by the sentence, so a screen reader reads the consequence with them; and focus
// returns to the first button when the question closes.
export function DestructiveAction({
  label,
  effect,
  disabled,
  quiet = false,
  onConfirm,
}: {
  label: string;
  effect: string;
  disabled: boolean;
  quiet?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const effectId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!asking && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [asking]);
  const close = () => {
    returnFocus.current = true;
    setAsking(false);
  };
  if (!asking) {
    return (
      <button
        ref={trigger}
        type="button"
        className={quiet ? controls.quiet : controls.destructive}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <div className={table.confirm} role="group" aria-label={label}>
      <p id={effectId} className="secondary">
        {effect}
      </p>
      <div className={controls.actions}>
        <button
          type="button"
          className={controls.destructive}
          disabled={disabled}
          aria-describedby={effectId}
          onClick={() => {
            close();
            onConfirm();
          }}
        >
          {label}
        </button>
        <button
          type="button"
          autoFocus
          className={controls.secondary}
          aria-describedby={effectId}
          onClick={close}
        >
          {strings.cancel}
        </button>
      </div>
    </div>
  );
}
