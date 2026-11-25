// A person put on staging's roster as an admin, by the suite's admin: the way the owner's
// own login gets there, since nobody can sign in to staging's office by hand to press
// Invite for him (Clerk's test mode is off, and the fixture numbers take no text). Signed
// in by the single-use ticket `scripts/staging.sh` made, then one call to `people.invite`,
// the same procedure the People screen calls. The number comes from the command line of
// the person running it and is never printed, logged or stored here: the answer's one
// word is all this says. Staging only: the config holds the address to STAGING_URL.
import { expect, test } from "@playwright/test";

import { uuidv7 } from "../src/app/uuidv7";
import { signInByTicket } from "./ticket-session";

const ticket = process.env.E2E_ADMIN_TICKET ?? "";
const phone = process.env.INVITE_PHONE ?? "";
const name = process.env.INVITE_NAME ?? "";

test("a person invited to staging's roster as an admin", async ({ page, context }) => {
  expect(ticket, "E2E_ADMIN_TICKET is set").not.toBe("");
  expect(phone.trim(), "a mobile number is given").not.toBe("");
  expect(name.trim(), "a name is given").not.toBe("");

  expect(await signInByTicket(page, ticket), "the ticket signs the admin in").toBe(true);

  // superjson on the wire (packages/api/src/core/trpc.ts): the input sits under `json`.
  const answer = await context.request.post("/api/trpc/people.invite", {
    data: { json: { id: uuidv7(), name, phone, role: "admin" } },
  });
  const body = await answer.text();
  const result = /"result":"([a-z_]+)"/.exec(body)?.[1] ?? "no answer";
  const code = /"code":"([a-z_A-Z]+)"/.exec(body)?.[1];
  console.log(
    `people.invite: HTTP ${answer.status()}, ${result}${code === undefined ? "" : ` (${code})`}`,
  );
  expect(result, "the person is on the roster, invited").toBe("invited");
});
