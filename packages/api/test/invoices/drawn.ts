import { inflateSync } from "node:zlib";

// The text a page draws, read back out of its content streams: each is deflated, and
// pdf-lib writes each string in it as hex.
export function drawn(bytes: Uint8Array): string {
  const file = Buffer.from(bytes);
  const text: string[] = [];
  let at = 0;
  for (;;) {
    const start = file.indexOf("stream\n", at, "latin1");
    if (start === -1) break;
    const end = file.indexOf("endstream", start, "latin1");
    // Past the word itself: `endstream` ends in `stream` too.
    at = end + "endstream".length;
    let content: string;
    try {
      content = inflateSync(file.subarray(start + 7, end)).toString("latin1");
    } catch {
      continue;
    }
    for (const m of content.matchAll(/<([0-9A-F]+)> Tj/g)) {
      text.push(Buffer.from(m[1]!, "hex").toString("latin1"));
    }
  }
  return text.join("\n");
}
