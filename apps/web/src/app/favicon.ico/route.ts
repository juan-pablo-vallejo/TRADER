// The favicon is favicon.png in assets/brand: logo.png, the master, made 48 px square
// (`sips -Z 48 logo.png --out favicon.png`), a few KB where the master is hundreds. It is
// read here at request time rather than copied into this app, so the asset keeps one home;
// next.config.ts traces it into the deployment. Cached for a day: the file changes only with a commit. The
// path is relative to the working directory, this app's directory under `next` locally; on
// Vercel the traced tree keeps the same shape.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const ICON = path.join(process.cwd(), "../../assets/brand/favicon.png");

export async function GET(): Promise<Response> {
  const body = await readFile(ICON);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
