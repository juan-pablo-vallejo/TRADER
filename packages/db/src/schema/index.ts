// The `@trader/db/schema` subpath: tables and enums only, consumed by drizzle.config.ts
// (`schema` path), the Stage 3 API (values for queries) and the Stage 5 app (`import type`
// of the unions). It never imports the client, so a value import here never loads `pg`.
// Stage 2 line 2 fills it with one file per table group, re-exported here.
export {};
