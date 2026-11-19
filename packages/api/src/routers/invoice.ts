// Invoices: admin only, at the gate. What a draft may hold and
// when an invoice may be issued or voided is judged inside each procedure.
import { roleProcedure, router } from "../core/trpc";
import {
  createInput,
  createInvoice,
  createOutput,
  removeInput,
  removeInvoice,
  removeOutput,
  saveInput,
  saveInvoice,
  saveOutput,
} from "../invoices/draft";
import { invoicePdf, pdfInput, pdfOutput } from "../invoices/pdf";
import {
  issueInput,
  issueInvoice,
  issueOutput,
  voidInput,
  voidInvoice,
  voidOutput,
} from "../invoices/issue";
import {
  recordInput,
  recordOutput,
  recordPayment,
  reverseInput,
  reverseOutput,
  reversePayment,
} from "../invoices/payments";
import {
  listInvoices,
  listOutput,
  readInput,
  readInvoice,
  readOutput,
  suggestInput,
  suggestLines,
  suggestOutput,
} from "../invoices/read";
import { isClosed } from "../core/demo-door";
import { restrictedTo } from "../core/mailer";
import { sendInput, sendInvoice, sendOutput } from "../invoices/send";

const admin = roleProcedure("admin");

export const invoiceRouter = router({
  list: admin.output(listOutput).query(({ ctx }) => listInvoices(ctx.tx)),
  read: admin
    .input(readInput)
    .output(readOutput)
    .query(({ ctx, input }) => readInvoice(ctx.tx, input)),
  suggest: admin
    .input(suggestInput)
    .output(suggestOutput)
    .query(({ ctx, input }) => suggestLines(ctx.tx, ctx.user, input)),
  create: admin
    .input(createInput)
    .output(createOutput)
    .mutation(({ ctx, input }) => createInvoice(ctx.tx, ctx.user, input)),
  save: admin
    .input(saveInput)
    .output(saveOutput)
    .mutation(({ ctx, input }) => saveInvoice(ctx.tx, ctx.user, input)),
  remove: admin
    .input(removeInput)
    .output(removeOutput)
    .mutation(({ ctx, input }) => removeInvoice(ctx.tx, ctx.user, input)),
  issue: admin
    .input(issueInput)
    .output(issueOutput)
    .mutation(({ ctx, input }) => issueInvoice(ctx.tx, ctx.user, input)),
  void: admin
    .input(voidInput)
    .output(voidOutput)
    .mutation(({ ctx, input }) => voidInvoice(ctx.tx, ctx.user, input)),
  recordPayment: admin
    .input(recordInput)
    .output(recordOutput)
    .mutation(({ ctx, input }) => recordPayment(ctx.tx, ctx.user, input)),
  reversePayment: admin
    .input(reverseInput)
    .output(reverseOutput)
    .mutation(({ ctx, input }) => reversePayment(ctx.tx, ctx.user, input)),
  pdf: admin
    .input(pdfInput)
    .output(pdfOutput)
    .query(({ ctx, input }) => invoicePdf(ctx.tx, input)),
  send: admin
    .input(sendInput)
    .output(sendOutput)
    .mutation(({ ctx, input }) =>
      sendInvoice(
        ctx.tx,
        ctx.user,
        input,
        // The closed company's invoices go to the deployment's allow-list and nowhere
        // else, blank being nobody (core/demo-door.ts); the service is not even asked.
        isClosed(ctx.closed, ctx.user.companyId)
          ? restrictedTo(ctx.closed!.allowed, ctx.mailer)
          : ctx.mailer,
      ),
    ),
});
