// A database's schema as sorted lines of text, read from the catalog: what the promotion
// compares between a branch it migrated and a fresh replay of the same journal (README,
// "Proving nothing differs from the journal"). It names tables and their row-security
// flags, columns, constraints, indexes, triggers, the journal's own functions, extensions by
// name, policies, enum labels, views,
// the application role's grants and that role's attributes; it names no owner, since the
// owner differs between a deployed database and a local one by design, and no data.
// Consumed by run-promotion.ts and test/promotion/fingerprint.test.ts.

type Query = (text: string) => Promise<{ rows: Record<string, unknown>[] }>;

const SECTIONS: [string, string][] = [
  [
    "table",
    `select c.relname, c.relkind::text, c.relrowsecurity::text, c.relforcerowsecurity::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'S')`,
  ],
  [
    "column",
    `select c.relname, a.attnum::text, a.attname, format_type(a.atttypid, a.atttypmod),
            a.attnotnull::text, coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
            a.attidentity::text, a.attgenerated::text
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
       and a.attnum > 0 and not a.attisdropped`,
  ],
  [
    "constraint",
    `select c.relname, o.conname, pg_get_constraintdef(o.oid),
            o.condeferrable::text, o.condeferred::text
     from pg_constraint o
     join pg_class c on c.oid = o.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'`,
  ],
  [
    "index",
    `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'`,
  ],
  [
    "trigger",
    `select c.relname, t.tgname, pg_get_triggerdef(t.oid), t.tgenabled::text
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal`,
  ],
  [
    "function",
    `select p.proname, pg_get_function_identity_arguments(p.oid),
            md5(pg_get_functiondef(p.oid)), p.prosecdef::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend e
                       where e.objid = p.oid and e.deptype = 'e')`,
  ],
  [
    "policy",
    `select tablename, policyname, permissive, roles::text, cmd,
            coalesce(qual, ''), coalesce(with_check, '')
     from pg_policies where schemaname = 'public'`,
  ],
  [
    "enum",
    `select t.typname, e.enumsortorder::text, e.enumlabel
     from pg_enum e
     join pg_type t on t.oid = e.enumtypid
     join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'`,
  ],
  // An extension by name: its own functions and its version are the server's, not the
  // journal's, and are left out above.
  ["extension", `select extname from pg_extension where extname <> 'plpgsql'`],
  ["view", `select viewname, definition from pg_views where schemaname = 'public'`],
  [
    "table-grant",
    `select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'trader_app' and table_schema = 'public'`,
  ],
  [
    "column-grant",
    `select table_name, column_name, privilege_type
     from information_schema.role_column_grants
     where grantee = 'trader_app' and table_schema = 'public'`,
  ],
  [
    "routine-grant",
    `select routine_name, privilege_type from information_schema.role_routine_grants
     where grantee = 'trader_app' and routine_schema = 'public'`,
  ],
  [
    "app-role",
    `select rolname, rolsuper::text, rolbypassrls::text, rolinherit::text,
            rolcreaterole::text, rolcreatedb::text
     from pg_roles where rolname = 'trader_app'`,
  ],
];

// One line a row: the section, then its values, tab-separated, whitespace runs made one
// space so a definition reads the same however the catalog wrapped it.
const line = (section: string, row: Record<string, unknown>) =>
  [section, ...Object.values(row).map((v) => String(v).replace(/\s+/g, " ").trim())].join(
    "\t",
  );

export async function schemaFingerprint(query: Query): Promise<string[]> {
  // Names print unqualified only for a schema on the path: the same path on both sides.
  await query(`select set_config('search_path', 'public', false)`);
  const lines: string[] = [];
  for (const [section, text] of SECTIONS) {
    const { rows } = await query(text);
    for (const row of rows) lines.push(line(section, row));
  }
  return lines.sort();
}
