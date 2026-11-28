// The sweep's gallery: one page, <run folder>/index.html, every picture by screen and then
// by cell, each fault check.mjs found drawn as a box on its picture and named under it.
// Reads the *.faults.json verdict.mjs leaves beside each tree; writes nothing else.
//
//   node scripts/sweep/gallery.mjs <run folder>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Console } from "node:console";
import process from "node:process";

const console = new Console(process.stdout, process.stderr);

const run = process.argv[2];
if (run === undefined || !existsSync(run)) {
  console.error("usage: gallery.mjs <run folder>");
  process.exit(64);
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

const cells = readdirSync(run, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
// screen -> [{ cell, png, faults, width, height }]
const screens = new Map();
let faultCount = 0;
for (const cell of cells) {
  for (const png of readdirSync(join(run, cell))
    .filter((f) => f.endsWith(".png"))
    .sort()) {
    const name = png.replace(/\.(failed\.)?png$/, "");
    const verdict = join(run, cell, `${name}.faults.json`);
    const v = existsSync(verdict)
      ? JSON.parse(readFileSync(verdict, "utf8"))
      : {
          width: 0,
          height: 0,
          faults: png.endsWith(".failed.png")
            ? [{ what: "the step failed", box: null }]
            : [],
        };
    faultCount += v.faults.length;
    const list = screens.get(name) ?? [];
    list.push({ cell, png: `${cell}/${png}`, ...v });
    screens.set(name, list);
  }
}

const figure = (s) => {
  const boxes = s.faults
    .filter((f) => f.box && s.width > 0 && s.height > 0)
    .map((f) => {
      const [x0, y0, x1, y1] = f.box;
      const pct = (v, of) => `${((v / of) * 100).toFixed(2)}%`;
      return `<span class="box" title="${esc(f.what)}" style="left:${pct(x0, s.width)};top:${pct(y0, s.height)};width:${pct(x1 - x0, s.width)};height:${pct(y1 - y0, s.height)}"></span>`;
    })
    .join("");
  const list = s.faults.length
    ? `<ol>${s.faults.map((f) => `<li>${esc(f.what)}</li>`).join("")}</ol>`
    : "";
  return `<figure class="${s.faults.length ? "bad" : ""}"><figcaption>${esc(s.cell)}${s.faults.length ? ` · ${s.faults.length}` : ""}</figcaption><div class="pic"><a href="${esc(s.png)}"><img loading="lazy" src="${esc(s.png)}" alt="${esc(s.cell)}"></a>${boxes}</div>${list}</figure>`;
};

const sections = [...screens.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([name, shots]) =>
      `<section id="${esc(name)}"><h2>${esc(name)} <small>${shots.length} pictures</small></h2><div class="row">${shots.map(figure).join("")}</div></section>`,
  )
  .join("\n");
const toc = [...screens.keys()]
  .sort()
  .map((n) => `<a href="#${esc(n)}">${esc(n)}</a>`)
  .join(" ");

writeFileSync(
  join(run, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TRADER sweep</title>
<style>
body{margin:0;font:14px/1.4 system-ui,sans-serif;color:#111827;background:#f5f6f8}
header{background:#140064;color:#fff;padding:16px}header h1{margin:0;font-size:22px}
header p{margin:4px 0 0;color:#bdb8d4}nav{padding:8px 16px;line-height:2}
section{padding:8px 16px}h2{margin:16px 0 8px;font-size:17px}h2 small{color:#4b5563;font-weight:400}
.row{display:flex;gap:12px;overflow-x:auto;align-items:flex-start;padding-bottom:8px}
figure{margin:0;flex:0 0 220px;background:#fff;border:1px solid #d9dce3;border-radius:8px;padding:8px}
figure.bad{border-color:#991b1b}figcaption{font-size:12px;color:#4b5563;margin-bottom:4px;overflow-wrap:anywhere}
.pic{position:relative}.pic img{width:100%;display:block}
.box{position:absolute;outline:2px solid #bc0c0c;background:rgb(188 12 12 / 12%)}
ol{margin:6px 0 0;padding-left:18px;font-size:12px;color:#991b1b}
</style></head><body>
<header><h1>The sweep</h1><p>${cells.length} cells · ${screens.size} screens · ${faultCount} faults · ${esc(run)}</p></header>
<nav>${toc}</nav>
${sections}
</body></html>
`,
);
console.log(join(run, "index.html"));
