import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Root .env — one file for the whole monorepo.
config({ path: "../../.env" });

const useLocal = process.env.USE_LOCAL_POSTGRES === "true";
const url = useLocal
  ? process.env.LOCAL_DATABASE_URL
  : (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

if (!url) {
  throw new Error(
    "No database URL. Set USE_LOCAL_POSTGRES=true with LOCAL_DATABASE_URL, or DATABASE_URL_UNPOOLED for Neon.",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  // Surfaces destructive operations in generated SQL rather than applying them quietly.
  verbose: true,
  strict: true,
});
