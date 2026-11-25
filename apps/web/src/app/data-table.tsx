// The office's table, as one piece: columns, rows, a caption, and what stands in its place
// while it loads, when it is empty and when it failed. Rows may be grouped under a
// heading, a closing row may hold totals, and a cell may open something. Still a native
// `<table>`, so a screen reader reads rows and columns, and still table.module.css, whose
// container query stacks a row into a card when the column is narrow: a cell's
// `data-label` is what names it there.
import type { ReactNode } from "react";

import { EmptyState } from "./empty-state";
import { LoadingRows } from "./loading-rows";
import table from "./table.module.css";

// The control that opens a row's record, by the row's key: where a panel opened by its
// address hands the focus back (side-panel.tsx).
export const rowOpener = (key: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-open="${CSS.escape(key)}"]`);

export type Column<Row> = {
  key: string;
  header: string;
  // What names the cell in a narrow row; the header when not given.
  label?: string;
  // Figures: right aligned, tabular, and labeled in a narrow row.
  number?: boolean;
  cell: (row: Row) => ReactNode;
  // A cell with nothing to say is left out of a narrow row.
  empty?: (row: Row) => boolean;
  // What the cell opens, and the name of that for a screen reader; null when it opens
  // nothing for this row.
  open?: (row: Row) => { label: string; onOpen: () => void } | null;
  // A row's act (its Edit): on a line of its own, a full target tall, in a narrow row.
  action?: boolean;
  // The closing row's cell for this column.
  total?: ReactNode;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  failed,
  empty,
  groupOf,
  totalLabel,
  lines = false,
}: {
  // Names the table; read by a screen reader, not drawn.
  caption: string;
  columns: Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  // What to draw when the read failed (failure.tsx's banner).
  failed?: ReactNode;
  // The sentence for no rows.
  empty: string;
  // Rows that share a group's key stand under its heading, in the order the rows came.
  groupOf?: (row: Row) => { key: string; heading: ReactNode };
  // The closing row's name, when any column has a total.
  totalLabel?: string;
  // A table of figures by column: a narrow row gives each cell its own line.
  lines?: boolean;
}) {
  if (failed !== undefined) return <>{failed}</>;
  if (loading) return <LoadingRows />;
  if (rows.length === 0) return <EmptyState text={empty} />;

  const groups: { key: string; heading: ReactNode | null; rows: Row[] }[] = [];
  for (const row of rows) {
    const group = groupOf?.(row);
    const last = groups.at(-1);
    if (last !== undefined && last.key === (group?.key ?? "")) last.rows.push(row);
    else
      groups.push({
        key: group?.key ?? "",
        heading: group?.heading ?? null,
        rows: [row],
      });
  }
  const hasTotals = columns.some((c) => c.total !== undefined);

  const drawn = (
    // `data-keys`: the arrow keys and J and K move through these rows (keyboard-rows.tsx).
    <table className={lines ? `${table.table} ${table.lines}` : table.table} data-keys>
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className={c.number ? table.number : undefined}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.key}>
          {group.heading !== null && (
            <tr className={table.group}>
              <th scope="rowgroup" colSpan={columns.length}>
                {group.heading}
              </th>
            </tr>
          )}
          {group.rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c, index) => {
                const opens = c.open?.(row) ?? null;
                const content = c.cell(row);
                return (
                  <td
                    key={c.key}
                    // The row's first cell names the row, for a screen reader's table
                    // reading; a cell kept as td, so the stacked layout's rules hold.
                    role={index === 0 ? "rowheader" : undefined}
                    data-label={c.label ?? c.header}
                    data-empty={c.empty?.(row) ? "" : undefined}
                    className={[
                      c.number ? table.number : "",
                      c.action ? table.action : "",
                      index === 0 ? "body-strong" : "",
                    ]
                      .join(" ")
                      .trim()}
                  >
                    {opens === null ? (
                      content
                    ) : (
                      // Its name is what it shows, then the row and the act: a person who
                      // says the figure they see reaches it.
                      <button
                        type="button"
                        className={table.cellOpen}
                        data-open={rowKey(row)}
                        onClick={opens.onOpen}
                      >
                        {content}
                        <span className="visually-hidden">{`, ${opens.label}`}</span>
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      ))}
      {hasTotals && (
        <tfoot>
          <tr className={table.totals}>
            {columns.map((c, index) => (
              <td
                key={c.key}
                role={index === 0 ? "rowheader" : undefined}
                data-label={c.label ?? c.header}
                data-empty={index !== 0 && c.total === undefined ? "" : undefined}
                className={[c.number ? table.number : "", "body-strong"].join(" ").trim()}
              >
                {index === 0 ? totalLabel : c.total}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
  // Many columns of figures can be wider than the column they stand in before the row
  // stacks: then the table scrolls inside its own box, reachable by keyboard, and the page
  // itself never scrolls sideways.
  return lines ? (
    <div className={table.scroll} role="region" aria-label={caption} tabIndex={0}>
      {drawn}
    </div>
  ) : (
    drawn
  );
}
