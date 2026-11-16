// The reading of a migration before staging's promotion applies it by itself (ARCHITECTURE,
// 2026-11-16, migration gate). It names what a statement may destroy, revoke or refuse on
// existing rows; a migration with any flag waits for the owner's own dispatch. It is a
// reading of the text, deliberately wide: a flag says "a person looks first", never "wrong".
// The body of CREATE FUNCTION is not read, since it runs when called and not when migrated;
// a DO block is, since it runs at once. Consumed by plan.ts and run-promotion.ts.

export type MigrationFlag =
  | "drop"
  | "truncate"
  | "delete"
  | "update_without_where"
  | "revoke"
  | "role_change"
  | "row_security_weakened"
  | "enum_value_added"
  | "not_null_without_default"
  | "set_not_null"
  | "column_type_changed"
  | "rename";

const BREAKPOINT = "--> statement-breakpoint";

// Line comments and block comments say nothing a database runs.
const withoutComments = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

// A quoted string can hold any word: 'DROP' in a message is not a DROP.
const withoutStrings = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''");

const isFunctionDefinition = (statement: string) =>
  /^\s*CREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE)\b/i.test(statement);

const RULES: [MigrationFlag, RegExp][] = [
  // Dropping a default or a NOT NULL loosens a column and destroys nothing.
  ["drop", /\bDROP\s+(?!NOT\s+NULL\b|DEFAULT\b)/i],
  ["delete", /\bDELETE\s+FROM\b/i],
  ["revoke", /\bREVOKE\b/i],
  ["role_change", /\b(CREATE|ALTER|DROP)\s+(ROLE|USER)\b|\bSET\s+ROLE\b/i],
  ["row_security_weakened", /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b|\bNO\s+FORCE\b/i],
  ["enum_value_added", /\bALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i],
  ["set_not_null", /\bSET\s+NOT\s+NULL\b/i],
  ["column_type_changed", /\bALTER\s+COLUMN\b[\s\S]*?\b(SET\s+DATA\s+)?TYPE\b/i],
  ["rename", /\bRENAME\b/i],
];

// One ADD COLUMN clause at a time: NOT NULL with no DEFAULT fails on a table holding rows.
const addsNotNullWithoutDefault = (statement: string) =>
  [...statement.matchAll(/\bADD\s+COLUMN\b([^,;]*)/gi)].some(
    ([, clause = ""]) => /\bNOT\s+NULL\b/i.test(clause) && !/\bDEFAULT\b/i.test(clause),
  );

// An UPDATE that names no WHERE rewrites every row. ON CONFLICT DO UPDATE and a trigger's
// "BEFORE UPDATE" are not statements of their own.
const updatesWithoutWhere = (statement: string) =>
  /^\s*UPDATE\s+(?!OF\b)/i.test(statement) && !/\bWHERE\b/i.test(statement);

export function readMigration(sql: string): MigrationFlag[] {
  const found = new Set<MigrationFlag>();
  for (const raw of sql.split(BREAKPOINT)) {
    const statement = withoutStrings(withoutComments(raw));
    if (isFunctionDefinition(statement)) continue;
    for (const [flag, pattern] of RULES) if (pattern.test(statement)) found.add(flag);
    if (addsNotNullWithoutDefault(statement)) found.add("not_null_without_default");
    // Statement by statement inside a DO block too. A trigger's BEFORE TRUNCATE and a
    // privilege named TRUNCATE are not a TRUNCATE.
    for (const part of statement.split(/;|\b(?:BEGIN|THEN|ELSE|LOOP)\b/i)) {
      if (updatesWithoutWhere(part)) found.add("update_without_where");
      if (/^\s*TRUNCATE\b/i.test(part)) found.add("truncate");
    }
  }
  return [...found].sort();
}
