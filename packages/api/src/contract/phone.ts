// The procedures an installed phone build calls. A released build is used for weeks, so
// each of these may only grow: never a removed, renamed or retyped field, a new required
// input, a narrowed input or a changed default ("The phone's contract",
// docs/ARCHITECTURE.md). test/contract/phone.test.ts holds this list to the phone's source;
// test/contract/wire.json pins every procedure's schemas.
export const PHONE_PROCEDURES = [
  "shift.create",
  "shift.moveToday",
  "demo.signIn",
  "job.setLocation",
  "me.addEmail",
  "me.get",
  "me.sendEmailCode",
  "me.update",
  "overview.today",
  "people.list",
  "status.get",
  "sync.pull",
  "sync.push",
] as const;
