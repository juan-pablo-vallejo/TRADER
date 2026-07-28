// Fails when a relative markdown link points at a file that does not exist.
// External URLs are deliberately not checked — they flake for reasons
// unrelated to the change under review. Scans tracked .md files only
// (git ls-files), so node_modules never enters.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = execFileSync("git", ["ls-files", "*.md"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const broken = [];
for (const file of files) {
  // Strip fenced code blocks so mermaid diagrams and code samples cannot
  // false-positive as links.
  const prose = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#")[0];
    if (path && !existsSync(resolve(dirname(file), path))) {
      broken.push(`${file}: ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken relative links:\n  ${broken.join("\n  ")}`);
  process.exit(1);
}
console.log(`${files.length} markdown files checked, all relative links resolve.`);
