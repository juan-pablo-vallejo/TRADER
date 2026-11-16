// The developer console's read (DESIGN, Developer console): admin only, nothing written.
import { roleProcedure, router } from "../core/trpc";
import { developerOutput, developerView } from "../developer/get";

export const developerRouter = router({
  get: roleProcedure("admin")
    .output(developerOutput)
    .query(({ ctx }) => developerView(ctx.tx, process.env)),
});
