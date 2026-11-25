// The weekly schedule. The writers and the office reads are admin only, at the gate. What a
// shift may name is judged inside each writer.
import {
  confirmCopy,
  copyConfirmInput,
  copyConfirmOutput,
  copyPreview,
  copyPreviewInput,
  copyUndoInput,
  copyUndoOutput,
  previewCopy,
  undoCopy,
} from "../shifts/copy";
import { weekShifts, weekInput, weekOutput } from "../shifts/list";
import {
  endEarlyInput,
  endEarlyOutput,
  endShiftEarly,
  moveToday,
  moveTodayInput,
  moveTodayOutput,
} from "../shifts/move";
import {
  createShifts,
  createInput,
  createOutput,
  removeShift,
  removeInput,
  removeOutput,
  updateShift,
  updateInput,
  updateOutput,
} from "../shifts/write";
import { roleProcedure, router } from "../core/trpc";

export const shiftRouter = router({
  week: roleProcedure("admin")
    .input(weekInput)
    .output(weekOutput)
    .query(({ ctx, input }) => weekShifts(ctx.tx, input)),
  create: roleProcedure("admin")
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createShifts(ctx.tx, ctx.user, input)),
  update: roleProcedure("admin")
    .input(updateInput)
    .output(updateOutput)
    .mutation(({ ctx, input }) => updateShift(ctx.tx, ctx.user, input)),
  remove: roleProcedure("admin")
    .input(removeInput)
    .output(removeOutput)
    .mutation(({ ctx, input }) => removeShift(ctx.tx, ctx.user, input)),
  endEarly: roleProcedure("admin")
    .input(endEarlyInput)
    .output(endEarlyOutput)
    .mutation(({ ctx, input }) => endShiftEarly(ctx.tx, ctx.user, input)),
  moveToday: roleProcedure("admin")
    .input(moveTodayInput)
    .output(moveTodayOutput)
    .mutation(({ ctx, input }) => moveToday(ctx.tx, ctx.user, input)),
  copyPreview: roleProcedure("admin")
    .input(copyPreviewInput)
    .output(copyPreview)
    .query(({ ctx, input }) => previewCopy(ctx.tx, input)),
  copyConfirm: roleProcedure("admin")
    .input(copyConfirmInput)
    .output(copyConfirmOutput)
    .mutation(({ ctx, input }) => confirmCopy(ctx.tx, ctx.user, input)),
  copyUndo: roleProcedure("admin")
    .input(copyUndoInput)
    .output(copyUndoOutput)
    .mutation(({ ctx, input }) => undoCopy(ctx.tx, ctx.user, input)),
});
