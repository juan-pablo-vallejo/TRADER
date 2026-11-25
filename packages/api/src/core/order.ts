// How a list orders people, customers and jobs by name: by ICU's root collation, which puts an
// accented letter beside its plain one ("Ángel" after "Ana", not after "Zoe") and a capital
// beside its small letter, as the apps' own `localeCompare` does. The database's own collation
// is C.UTF-8, a byte order, which would put every accented name last.
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const byName = (column: AnyPgColumn): SQL => sql`${column} collate "und-x-icu"`;
