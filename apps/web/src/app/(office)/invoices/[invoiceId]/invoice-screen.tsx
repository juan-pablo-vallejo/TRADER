"use client";

// One invoice. A draft: its lines as rows of fields (description, quantity, unit and the
// price the admin types) with the job's hours by day beside them, the tax, and the totals
// as they would be saved. A day's hours can be copied into a new line's quantity; its price
// field arrives empty, and no price is ever suggested.
// Issuing asks first and says what it does; an issued invoice shows no field at all, and the
// one thing left to do with it is to void it. The amounts on screen are worked out as the
// server works them out (api invoices/lines.ts) and stored by the server alone.
import type { AppRouter } from "@trader/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { uuidv7 } from "../../../uuidv7";
import controls from "../../../controls.module.css";
import { codeOf, EmptyState, Failure } from "../../../failure";
import { Field } from "../../../field";
import { amount, cents } from "../../../format";
import { Note } from "../../../note";
import { PageHeader } from "../../../page-header";
import { DestructiveAction } from "../../../row-editor";
import { useStrings } from "../../../i18n";
import table from "../../../table.module.css";
import { useTRPC } from "../../../trpc";
import styles from "../invoices.module.css";

type Invoice = inferRouterOutputs<AppRouter>["invoice"]["read"];

// A line as it is typed: the price is text until it is a price.
type Draft = {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
};

const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;

// A typed line as the API takes it, or null while it is not one yet.
function parsed(line: Draft) {
  const unitPriceCents = cents(line.price);
  const quantity = line.quantity.trim();
  if (
    line.description.trim() === "" ||
    !QUANTITY.test(quantity) ||
    Number(quantity) === 0 ||
    unitPriceCents === null
  ) {
    return null;
  }
  return {
    id: line.id,
    description: line.description.trim(),
    quantity,
    unit: line.unit.trim() === "" ? null : line.unit.trim(),
    unitPriceCents,
  };
}

// Quantity times price, half-up to the cent, in integers: the server's own arithmetic.
function amountOf(quantity: string, unitPriceCents: number): number {
  const [whole, fraction = ""] = quantity.split(".");
  const thousandths = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return Number((thousandths * BigInt(unitPriceCents) + 500n) / 1000n);
}

function Totals({
  subtotal,
  tax,
  currency,
}: {
  subtotal: number;
  tax: number;
  currency: string;
}) {
  const { t, f } = useStrings();
  const s = t.invoices;
  return (
    <div className={styles.totals}>
      <div className="body">
        <span>{s.subtotal}</span>
        <span>{f.money(subtotal, currency)}</span>
      </div>
      <div className="body">
        <span>{s.tax}</span>
        <span>{f.money(tax, currency)}</span>
      </div>
      <div className={`body-strong ${styles.grand}`}>
        <span>{s.total}</span>
        <span>{f.money(subtotal + tax, currency)}</span>
      </div>
    </div>
  );
}

function DraftEditor({ invoice }: { invoice: Invoice }) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const refresh = () => queryClient.invalidateQueries(trpc.invoice.pathFilter());
  const [lines, setLines] = useState<Draft[]>(() =>
    invoice.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity.replace(/\.?0+$/, ""),
      unit: l.unit ?? "",
      price: amount(l.unitPriceCents),
    })),
  );
  const [tax, setTax] = useState(() => amount(invoice.taxCents));
  // Whether what is on screen is what is stored: an issue freezes what is stored.
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tone, setTone] = useState<"saved" | "error">("error");
  const offers = useQuery(trpc.invoice.suggest.queryOptions({ invoiceId: invoice.id }));

  const change = (next: Draft[]) => {
    setLines(next);
    setDirty(true);
    setNote(null);
  };
  const edit = (id: string, patch: Partial<Draft>) =>
    change(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = (line: Partial<Draft>) =>
    change([
      ...lines,
      {
        id: uuidv7(),
        description: "",
        quantity: "",
        unit: "",
        price: "",
        ...line,
      },
    ]);

  const taxCents = cents(tax);
  const subtotal = lines.reduce((n, l) => {
    const p = parsed(l);
    return p === null ? n : n + amountOf(p.quantity, p.unitPriceCents);
  }, 0);
  const fail = (text: string) => {
    setTone("error");
    setNote(text);
  };

  const save = useMutation(
    trpc.invoice.save.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          fail(answer.code === "too_large" ? s.tooLarge : s.isIssued);
          return;
        }
        setDirty(false);
        setTone("saved");
        setNote(s.saved);
        await refresh();
      },
      onError: () => fail(t.requestFailed),
    }),
  );
  const issue = useMutation(
    trpc.invoice.issue.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          fail(answer.code === "no_lines" ? s.noLines : s.noSeries);
          return;
        }
        await refresh();
      },
      onError: () => fail(t.requestFailed),
    }),
  );
  const remove = useMutation(
    trpc.invoice.remove.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          fail(s.isIssued);
          return;
        }
        await refresh();
        router.push("/invoices");
      },
      onError: () => fail(t.requestFailed),
    }),
  );
  const busy = save.isPending || issue.isPending || remove.isPending;
  const submit = () => {
    setNote(null);
    const sent = [];
    for (const [i, line] of lines.entries()) {
      const p = parsed(line);
      if (p === null) return fail(s.badLine(i + 1));
      sent.push(p);
    }
    if (taxCents === null) return fail(s.badTax);
    save.mutate({ invoiceId: invoice.id, taxCents, lines: sent });
  };

  return (
    <>
      <section className={styles.section} aria-label={s.lines}>
        <h2 className="heading">{s.lines}</h2>
        {lines.length === 0 && <p className="body">{s.noLines}</p>}
        {lines.map((line, i) => {
          const p = parsed(line);
          const n = i + 1;
          const id = `line-${line.id}`;
          return (
            <div
              key={line.id}
              className={styles.line}
              role="group"
              aria-label={s.lineOf(n, line.description)}
            >
              <Field id={`${id}-d`} label={s.description}>
                <input
                  id={`${id}-d`}
                  className={controls.input}
                  maxLength={500}
                  value={line.description}
                  onChange={(e) => edit(line.id, { description: e.target.value })}
                />
              </Field>
              <Field id={`${id}-q`} label={s.quantity}>
                <input
                  id={`${id}-q`}
                  className={controls.input}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => edit(line.id, { quantity: e.target.value })}
                />
              </Field>
              <Field id={`${id}-u`} label={s.unit}>
                <input
                  id={`${id}-u`}
                  className={controls.input}
                  maxLength={32}
                  value={line.unit}
                  onChange={(e) => edit(line.id, { unit: e.target.value })}
                />
              </Field>
              <Field id={`${id}-p`} label={s.price}>
                <input
                  id={`${id}-p`}
                  className={controls.input}
                  inputMode="decimal"
                  value={line.price}
                  onChange={(e) => edit(line.id, { price: e.target.value })}
                />
              </Field>
              <div className={styles.lineFoot}>
                <span className="body">
                  {s.amount}:{" "}
                  {p === null
                    ? "—"
                    : f.money(amountOf(p.quantity, p.unitPriceCents), invoice.currency)}
                </span>
                <button
                  type="button"
                  className={controls.quiet}
                  onClick={() => change(lines.filter((l) => l.id !== line.id))}
                >
                  {s.removeLine(n)}
                </button>
              </div>
            </div>
          );
        })}
        <button type="button" className={controls.secondary} onClick={() => add({})}>
          {s.addLine}
        </button>
      </section>

      <section className={styles.section} aria-label={s.draw}>
        <h2 className="heading">{s.draw}</h2>
        <p className={`secondary ${styles.explain}`}>{s.drawExplain}</p>
        {offers.isPending ? (
          <p className="body">{t.loading}</p>
        ) : offers.isError ? (
          <p className="body">{t.requestFailed}</p>
        ) : offers.data.labor.length === 0 ? (
          <p className="body">{s.nothingToDraw}</p>
        ) : (
          <ul className={styles.offers}>
            {offers.data.labor.map((l) => {
              const label = s.laborOn(f.weekDay(l.workDate));
              return (
                <li key={l.workDate}>
                  <span className="body">
                    {label} · {s.hoursOf(l.quantity)}
                  </span>
                  <button
                    type="button"
                    className={controls.secondary}
                    aria-label={s.addOf(label)}
                    onClick={() =>
                      add({ description: label, quantity: l.quantity, unit: "h" })
                    }
                  >
                    {s.add}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <Field id="invoice-tax" label={s.tax}>
          <input
            id="invoice-tax"
            className={controls.input}
            inputMode="decimal"
            value={tax}
            onChange={(e) => {
              setTax(e.target.value);
              setDirty(true);
              setNote(null);
            }}
          />
        </Field>
        <Totals subtotal={subtotal} tax={taxCents ?? 0} currency={invoice.currency} />
        <div className={controls.actions}>
          <button
            type="button"
            className={controls.primary}
            disabled={busy}
            onClick={submit}
          >
            {s.save}
          </button>
        </div>
        <Note text={note} tone={tone} />
      </section>

      <div className={styles.danger}>
        {dirty || invoice.lines.length === 0 ? (
          <p className="secondary">
            {invoice.lines.length === 0 && !dirty ? s.noLines : s.unsaved}
          </p>
        ) : (
          <DestructiveAction
            label={s.issue}
            effect={s.issueEffect(f.money(invoice.totalCents, invoice.currency))}
            disabled={busy}
            onConfirm={() => issue.mutate({ invoiceId: invoice.id })}
          />
        )}
      </div>
      <div className={styles.danger}>
        <DestructiveAction
          quiet
          label={s.removeDraft}
          effect={s.removeEffect}
          disabled={busy}
          onConfirm={() => remove.mutate({ invoiceId: invoice.id })}
        />
      </div>
    </>
  );
}

// Today as the browser's calendar day: where the "Paid on" field starts, and no rule.
function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

const METHODS = ["check", "cash", "card", "bank_transfer", "other"] as const;

// What the customer has paid, as the office recorded it: what
// is owed, every payment and reversal, and — while the invoice is issued and something is
// owed — the form that records one. A payment is reversed, never edited or removed.
function Payments({ invoice }: { invoice: Invoice }) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries(trpc.invoice.pathFilter());
  const [id, setId] = useState(() => uuidv7());
  const [paid, setPaid] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("check");
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [tone, setTone] = useState<"saved" | "error">("error");
  const fail = (text: string) => {
    setTone("error");
    setNote(text);
  };
  const record = useMutation(
    trpc.invoice.recordPayment.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          fail(
            answer.code === "overpaid"
              ? s.overpaid(f.money(invoice.owedCents, invoice.currency))
              : t.requestFailed,
          );
          return;
        }
        // The next payment is a new record, under an id of its own.
        setId(uuidv7());
        setPaid("");
        setMemo("");
        setTone("saved");
        setNote(s.recorded);
        await refresh();
      },
      onError: () => fail(t.requestFailed),
    }),
  );
  const reverse = useMutation(
    trpc.invoice.reversePayment.mutationOptions({
      onSuccess: async () => {
        setNote(null);
        await refresh();
      },
      onError: () => fail(t.requestFailed),
    }),
  );
  const open = invoice.state === "issued";
  return (
    <section className={styles.section} aria-label={s.payments}>
      <h2 className="heading">{s.payments}</h2>
      {open && (
        <p className="body-strong">
          {invoice.owedCents === 0
            ? s.paidInFull
            : `${s.owed}: ${f.money(invoice.owedCents, invoice.currency)}`}
          {invoice.paidCents > 0 &&
            invoice.owedCents > 0 &&
            ` · ${s.paid}: ${f.money(invoice.paidCents, invoice.currency)}`}
        </p>
      )}
      {invoice.payments.length === 0 ? (
        <p className="body">{s.noPayments}</p>
      ) : (
        <ul className={styles.offers}>
          {invoice.payments.map((p) => {
            const amountText = f.money(p.amountCents, invoice.currency);
            return (
              <li key={p.id}>
                <span className="body">
                  {s.paymentLine(
                    amountText,
                    f.weekDay(p.paidOn),
                    s.methods[p.method as keyof typeof s.methods] ?? p.method,
                  )}
                  {p.note !== null && ` · ${p.note}`}
                  <span className={`secondary ${styles.payMeta}`}>
                    {p.reversesPaymentId !== null
                      ? s.reversalMark
                      : p.reversed
                        ? s.reversedMark
                        : s.recordedBy(p.recordedBy)}
                  </span>
                </span>
                {open && p.reversesPaymentId === null && !p.reversed && (
                  <DestructiveAction
                    quiet
                    label={s.reverseOf(amountText)}
                    effect={s.reverseEffect(amountText)}
                    disabled={reverse.isPending}
                    onConfirm={() =>
                      reverse.mutate({ id: uuidv7(), paymentId: p.id, note: null })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {open && invoice.owedCents > 0 && (
        <form
          className={`${controls.card} ${styles.payForm}`}
          aria-label={s.recordPayment}
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            const amountCents = cents(paid);
            if (amountCents === null || amountCents === 0) return fail(s.badAmount);
            record.mutate({
              id,
              invoiceId: invoice.id,
              amountCents,
              paidOn,
              method,
              note: memo.trim() === "" ? null : memo.trim(),
            });
          }}
        >
          <h3 className="body-strong">{s.recordPayment}</h3>
          <p className={`secondary ${styles.explain}`}>{s.recordExplain}</p>
          <div className={styles.payFields}>
            <Field id="pay-amount" label={s.paymentAmount}>
              <input
                id="pay-amount"
                className={controls.input}
                inputMode="decimal"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </Field>
            <Field id="pay-day" label={s.paymentDay}>
              <input
                id="pay-day"
                className={controls.input}
                type="date"
                required
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
            <Field id="pay-method" label={s.paymentMethod}>
              <select
                id="pay-method"
                className={controls.select}
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {s.methods[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pay-note" label={s.paymentNote}>
              <input
                id="pay-note"
                className={controls.input}
                maxLength={500}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </Field>
          </div>
          <div className={controls.actions}>
            <button
              type="submit"
              className={controls.primary}
              disabled={record.isPending}
            >
              {s.record}
            </button>
          </div>
          <Note text={note} tone={tone} />
        </form>
      )}
    </section>
  );
}

// The invoice as a PDF, made by the server when asked and saved by the browser: the page
// the customer is sent. Offered for an issued invoice and a void one; a draft has none.
function PdfFile({ invoiceId }: { invoiceId: string }) {
  const { t } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    setNote(null);
    setSaved(false);
    try {
      const file = await queryClient.fetchQuery(
        trpc.invoice.pdf.queryOptions({ invoiceId }, { staleTime: 0, gcTime: 0 }),
      );
      if (file.result !== "rendered") {
        setNote(t.requestFailed);
        return;
      }
      const bytes = Uint8Array.from(atob(file.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setSaved(true);
      setNote(s.pdfSaved(file.filename));
    } catch {
      setNote(t.requestFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.section} aria-label={s.pdf}>
      <button
        type="button"
        className={controls.secondary}
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? t.loading : s.pdf}
      </button>
      <Note text={note} tone={saved ? "saved" : undefined} />
    </section>
  );
}

// The page sent to the customer by email, and every time it was. A send that failed is
// listed as failed with why, and can be sent again; nothing is sent for a void invoice. The
// address offered is the customer's on file, and the admin may type another.
function Sends({ invoice }: { invoice: Invoice }) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queryClient = useQueryClient();
  const [to, setTo] = useState(invoice.customerEmail ?? "");
  const [id, setId] = useState(() => uuidv7());
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = useMutation(
    trpc.invoice.send.mutationOptions({
      onSuccess: async (answer) => {
        // The next press is a new send; a retry of this one kept its id until answered.
        setId(uuidv7());
        const went =
          answer.result === "sent" ||
          (answer.result === "duplicate" && answer.outcome === "sent");
        setSent(went);
        setNote(
          went
            ? s.sendSent
            : answer.result === "failed"
              ? s.sendFailures[answer.failure]
              : answer.result === "duplicate"
                ? s.sendFailed
                : t.requestFailed,
        );
        await queryClient.invalidateQueries(trpc.invoice.pathFilter());
      },
      onError: () => {
        setSent(false);
        setNote(t.requestFailed);
      },
    }),
  );
  return (
    <section className={styles.section} aria-label={s.sendHeading}>
      <h2 className="heading">{s.sendHeading}</h2>
      {invoice.sends.length === 0 ? (
        <p className="secondary">{s.noSends}</p>
      ) : (
        <ul className={styles.sends}>
          {invoice.sends.map((x) => (
            <li key={x.id} className="body">
              {x.outcome === "sent"
                ? s.sentTo(x.recipient, x.sentBy, f.stamp(x.sentAt, zone))
                : s.failedTo(x.recipient, x.sentBy, f.stamp(x.sentAt, zone))}
            </li>
          ))}
        </ul>
      )}
      {invoice.state === "issued" && (
        <form
          className={`${controls.card} ${styles.payForm}`}
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            send.mutate({ id, invoiceId: invoice.id, to });
          }}
        >
          <p className={`secondary ${styles.explain}`}>{s.sendExplain}</p>
          <Field id="send-to" label={s.sendTo}>
            <input
              id="send-to"
              className={controls.input}
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className={controls.actions}>
            <button type="submit" className={controls.primary} disabled={send.isPending}>
              {send.isPending ? t.loading : s.send}
            </button>
          </div>
          <Note text={note} tone={sent ? "saved" : undefined} />
        </form>
      )}
    </section>
  );
}

function Issued({ invoice }: { invoice: Invoice }) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const voidIt = useMutation(
    trpc.invoice.void.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "rejected") {
          setNote(answer.code === "has_payments" ? s.hasPayments : t.requestFailed);
          return;
        }
        await queryClient.invalidateQueries(trpc.invoice.pathFilter());
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  return (
    <>
      <section className={styles.section} aria-label={s.lines}>
        <h2 className="heading">{s.lines}</h2>
        <table className={table.table}>
          <thead>
            <tr>
              <th scope="col">{s.description}</th>
              <th scope="col" className={table.number}>
                {s.quantity}
              </th>
              <th scope="col" className={table.number}>
                {s.price}
              </th>
              <th scope="col" className={table.number}>
                {s.amount}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className={table.number}>
                  {l.quantity.replace(/\.?0+$/, "")}
                  {l.unit === null ? "" : ` ${l.unit}`}
                </td>
                <td className={table.number}>
                  {f.money(l.unitPriceCents, invoice.currency)}
                </td>
                <td className={table.number}>
                  {f.money(l.amountCents, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Totals
          subtotal={invoice.subtotalCents}
          tax={invoice.taxCents}
          currency={invoice.currency}
        />
      </section>
      <Payments invoice={invoice} />
      <PdfFile invoiceId={invoice.id} />
      <Sends invoice={invoice} />
      {invoice.state === "issued" && invoice.number !== null && (
        <div className={styles.danger}>
          <DestructiveAction
            label={s.voidIt}
            effect={s.voidEffect(invoice.number)}
            disabled={voidIt.isPending}
            onConfirm={() => {
              setNote(null);
              voidIt.mutate({ invoiceId: invoice.id });
            }}
          />
          <Note text={note} />
        </div>
      )}
    </>
  );
}

export function InvoiceScreen({
  invoiceId,
  signInHref,
}: {
  invoiceId: string;
  signInHref: string;
}) {
  const { t, f } = useStrings();
  const s = t.invoices;
  const trpc = useTRPC();
  const read = useQuery(trpc.invoice.read.queryOptions({ invoiceId }));
  const back = (
    <p className={styles.back}>
      <Link href="/invoices">{s.back}</Link>
    </p>
  );
  if (read.isPending) {
    return (
      <>
        {back}
        <p className="body">{t.loading}</p>
      </>
    );
  }
  if (read.isError) {
    return (
      <>
        {back}
        {codeOf(read.error) === "FORBIDDEN" ? (
          <EmptyState text={s.gone} />
        ) : (
          <Failure
            error={read.error}
            signInHref={signInHref}
            onRetry={() => void read.refetch()}
          />
        )}
      </>
    );
  }
  const invoice = read.data;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      {back}
      <PageHeader
        title={
          invoice.number === null
            ? s.draftOf(invoice.job.name)
            : s.invoiceNo(invoice.number)
        }
      />
      <p className={`body ${styles.meta}`}>
        {s.forCustomer(invoice.customer.name, invoice.job.name)} ·{" "}
        {s.states[invoice.state]}
      </p>
      {invoice.issuedAt !== null && invoice.issuedBy !== null && (
        <p className={`secondary ${styles.meta}`}>
          {s.issuedBy(invoice.issuedBy, f.stamp(invoice.issuedAt, zone))}
        </p>
      )}
      {invoice.voidedAt !== null && invoice.voidedBy !== null && (
        <p className={`secondary ${styles.meta}`}>
          {s.voidedBy(invoice.voidedBy, f.stamp(invoice.voidedAt, zone))}
        </p>
      )}
      {invoice.state === "draft" ? (
        // What is typed stays the editor's own until it is saved: a refetch after a save
        // must not start it afresh and drop the note that said so.
        <DraftEditor key={invoice.id} invoice={invoice} />
      ) : (
        <Issued invoice={invoice} />
      )}
    </>
  );
}
