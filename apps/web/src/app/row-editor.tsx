// The row editor (DESIGN, UI components): a table row's Edit toggle and the editor row that
// opens beneath it, plus the two pieces every editor is built from — a section and the footer
// where a destructive button stands last and alone. Consumed by the roster, customers, jobs
// and crews screens.
import type { ReactNode } from "react";

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
