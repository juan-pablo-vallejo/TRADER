// The API's reference, made from the pinned contract (test/contract/wire.json) and nothing
// else: one HTML page per router, each procedure with its kind, its input's and output's
// fields and their types, and a mark on the procedures an installed phone calls
// (PHONE_PROCEDURES). Written by `pnpm --filter @trader/api reference` to a folder outside
// the repository; nothing of it is committed.
import { groupBy } from "./core/group";

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schema[];
  oneOf?: Schema[];
  format?: string;
  "x-type"?: string;
};
type Procedure = { type: string; input: Schema[]; output?: Schema };
export type Wire = {
  procedures: Record<string, Procedure>;
  lists: Record<string, unknown[]>;
};

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A schema as one line: `string (uuid)`, `"a" | "b"`, `{ id: string, note?: string }`.
export function typeOf(schema: Schema | undefined): string {
  if (schema === undefined) return "nothing";
  if (schema["x-type"] === "date") return "date";
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  const options = schema.anyOf ?? schema.oneOf;
  if (options) return options.map(typeOf).join(" | ");
  const types = Array.isArray(schema.type) ? schema.type : [schema.type ?? "any"];
  return types
    .map((t) => {
      if (t === "array") return `${typeOf(schema.items)}[]`;
      if (t === "object" && schema.properties) {
        const required = new Set(schema.required ?? []);
        const fields = Object.entries(schema.properties).map(
          ([name, field]) => `${name}${required.has(name) ? "" : "?"}: ${typeOf(field)}`,
        );
        return `{ ${fields.join(", ")} }`;
      }
      return schema.format ? `${t} (${schema.format})` : String(t);
    })
    .join(" | ");
}

// A schema's top-level fields as table rows; a schema that is not an object is one row.
function rows(schema: Schema | undefined): string {
  if (schema?.properties) {
    const required = new Set(schema.required ?? []);
    return Object.entries(schema.properties)
      .map(
        ([name, field]) =>
          `<tr><td><code>${escape(name)}</code></td><td>${required.has(name) ? "yes" : "no"}</td><td><code>${escape(typeOf(field))}</code></td></tr>`,
      )
      .join("\n");
  }
  return `<tr><td colspan="2">(whole)</td><td><code>${escape(typeOf(schema))}</code></td></tr>`;
}

const table = (schema: Schema | undefined) =>
  `<table><thead><tr><th>Field</th><th>Required</th><th>Type</th></tr></thead><tbody>\n${rows(schema)}\n</tbody></table>`;

const page = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>` +
  `<style>body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}` +
  `table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem}td,th{border:1px solid #ccc;padding:.25rem .5rem;text-align:left;vertical-align:top}` +
  `code{font-size:13px;word-break:break-word}h1 code,h2 code{font-size:inherit}.phone{background:#140064;color:#fff;border-radius:4px;padding:0 .4rem;font-size:12px}</style>` +
  `</head><body>\n${body}\n</body></html>\n`;

// Every page, by file name: index.html and one <router>.html each.
export function reference(wire: Wire): Record<string, string> {
  const phone = new Set((wire.lists.PHONE_PROCEDURES ?? []).map(String));
  const routers = groupBy(
    Object.keys(wire.procedures).sort(),
    (path) => path.split(".")[0]!,
  );
  const pages: Record<string, string> = {};
  for (const [router, paths] of routers) {
    const sections = paths.map((path) => {
      const p = wire.procedures[path]!;
      const onPhone = phone.has(path);
      const mark = onPhone ? ' <span class="phone">phone</span>' : "";
      const input = p.input.at(-1);
      return (
        `<section id="${escape(path)}" data-procedure="${escape(path)}"${onPhone ? ' data-phone=""' : ""}>` +
        `<h2><code>${escape(path)}</code> · ${escape(p.type)}${mark}</h2>` +
        `<h3>Input</h3>${input === undefined ? "<p>None.</p>" : table(input)}` +
        `<h3>Output</h3>${table(p.output)}</section>`
      );
    });
    pages[`${router}.html`] = page(
      `TRADER API: ${router}`,
      `<p><a href="index.html">All routers</a></p><h1><code>${escape(router)}</code></h1>\n${sections.join("\n")}`,
    );
  }
  const links = [...routers]
    .map(
      ([router, paths]) =>
        `<li><a href="${escape(router)}.html"><code>${escape(router)}</code></a>: ${paths.length}</li>`,
    )
    .join("\n");
  pages["index.html"] = page(
    "TRADER API",
    `<h1>TRADER API</h1><p>From the pinned contract. <span class="phone">phone</span> marks what an installed phone calls.</p><ul>\n${links}\n</ul>`,
  );
  return pages;
}
