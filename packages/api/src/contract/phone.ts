// The procedures an installed phone build calls. A released build is used for weeks, so
// each of these may only grow: never a removed, renamed or retyped field, a new required
// input, a narrowed input or a changed default ("The phone's contract",
// docs/ARCHITECTURE.md). test/contract/phone.test.ts holds this list to the phone's source;
// test/contract/wire.json pins every procedure's schemas.
export const PHONE_PROCEDURES = [
  "assignment.create",
  "assignment.moveToday",
  "demo.signIn",
  "job.update",
  "me.get",
  "me.update",
  "overview.today",
  "roster.list",
  "status.get",
  "sync.pull",
  "sync.push",
] as const;

export type PhoneProcedure = (typeof PHONE_PROCEDURES)[number];
