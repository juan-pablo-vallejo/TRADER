// DESIGN, Brand: the favicon is logo.png, the one master in assets/brand. It is read here at
// request time rather than copied into this app, so the asset keeps one home; next.config.ts
// traces it into the deployment. Cached for a day: the file changes only with a commit. The
// path is relative to the working directory, this app's directory under `next` locally; on
// Vercel the traced tree keeps the same shape (verified at Stage 6).
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const LOGO = path.join(process.cwd(), "../../assets/brand/logo.png");

export async function GET(): Promise<Response> {
  const body = await readFile(LOGO);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
