// people.setLocationStamps: whether one person's clock taps are stamped with a location. Three
// answers: on, off, or null, which is "as the company" (companies.location_stamps). The
// person's own setting wins where it is set (sync/scope.ts, stampsOn). It changes what the
// next tap records and nothing already recorded. Judged under lock.ts's locks, as every
// roster writer is. The same value again is `unchanged` and writes nothing.
import { users } from "@trader/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../core/context";
import type { AppUser } from "../core/resolve-user";
import { person } from "./list";
import { lockPeopleRows } from "./lock";
import { answerWith } from "./role";

export const setLocationStampsInput = z.strictObject({
  userId: z.uuid(),
  locationStamps: z.boolean().nullable(),
});

export type SetLocationStampsInput = z.infer<typeof setLocationStampsInput>;

export const setLocationStampsOutput = z.discriminatedUnion("result", [
  z.strictObject({ result: z.literal("updated"), user: person }),
  z.strictObject({ result: z.literal("unchanged"), user: person }),
]);

export async function setLocationStamps(
  tx: Tx,
  user: AppUser,
  input: SetLocationStampsInput,
) {
  const { target } = await lockPeopleRows(tx, user, input.userId);
  const [now] = await tx
    .select({ locationStamps: users.locationStamps })
    .from(users)
    .where(eq(users.id, target.id));
  if (now === undefined) throw new Error("a locked users row is not visible");
  if (now.locationStamps === input.locationStamps) {
    return answerWith(tx, "unchanged", target.id);
  }
  await tx
    .update(users)
    .set({ locationStamps: input.locationStamps })
    .where(eq(users.id, target.id));
  return answerWith(tx, "updated", target.id);
}
