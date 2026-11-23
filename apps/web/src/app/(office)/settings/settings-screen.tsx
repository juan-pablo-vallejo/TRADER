"use client";

// Settings, behind the person's name. Three parts.
//
// Company: the details that print on every invoice (name, address, phone, email, how to
// pay, the terms in days) and the timezone, shown and never edited here: hours already
// recorded are placed on their days by it.
//
// Time clock: schedule enforcement and location stamps. Each is a switch that says in one
// sentence what it does as it stands, and what changing it will do before it changes it:
// both reach every phone at its next sync, and one of them can stop a person clocking in.
//
// Me: the person's own name, contact phone and language (me-form.tsx), and, where Clerk
// signs people in, their passkeys (clerk-passkeys.tsx).
//
// The first two are the company's and an admin's alone (`company.get`, `company.update`,
// which writes the keys it is given and no others, so a switch is saved without resending
// the details); anyone else sees Me. Consumed by page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { PasskeySection } from "../../clerk-passkeys";
import controls from "../../controls.module.css";
import { Failure } from "../../failure";
import { Field } from "../../field";
import { useStrings } from "../../i18n";
import { LoadingRows } from "../../loading-rows";
import { Note } from "../../note";
import { PageHeader } from "../../page-header";
import { useClerkOn } from "../../providers";
import { DestructiveAction } from "../../row-editor";
import { StatusBadge } from "../../status-badge";
import { useTRPC } from "../../trpc";
import { MeForm } from "./me-form";
import styles from "./settings.module.css";

export function SettingsScreen({ signInHref }: { signInHref: string }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const me = useQuery(trpc.me.get.queryOptions());
  const clerkOn = useClerkOn();
  return (
    <>
      <PageHeader title={t.settings.title} />
      {me.data?.role === "admin" && <CompanyParts signInHref={signInHref} />}
      <MeForm signInHref={signInHref} />
      {clerkOn && <PasskeySection className={styles.part} />}
    </>
  );
}

type Company = NonNullable<ReturnType<typeof useCompany>["data"]>;

function useCompany() {
  const trpc = useTRPC();
  return useQuery(trpc.company.get.queryOptions());
}

function CompanyParts({ signInHref }: { signInHref: string }) {
  const company = useCompany();
  if (company.isPending) return <LoadingRows rows={4} />;
  if (company.isError) {
    return (
      <Failure
        error={company.error}
        signInHref={signInHref}
        onRetry={() => void company.refetch()}
      />
    );
  }
  return (
    <>
      <Details company={company.data} />
      <Clock company={company.data} />
    </>
  );
}

type Draft = {
  name: string;
  address: string;
  phone: string;
  email: string;
  paymentInstructions: string;
  terms: string;
};

const draftOf = (c: Company): Draft => ({
  name: c.name,
  address: c.address ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  paymentInstructions: c.paymentInstructions ?? "",
  terms: String(c.invoiceTermsDays),
});

function Details({ company }: { company: Company }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // What was typed, or null: then the fields show the record as fetched.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [badTerms, setBadTerms] = useState(false);
  const fields = draft ?? draftOf(company);
  const change = (patch: Partial<Draft>) => {
    setNote(null);
    setBadTerms(false);
    setDraft({ ...fields, ...patch });
  };
  const save = useMutation(
    trpc.company.update.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        setNote(t.saved);
        // The header shows the company's name too.
        await queryClient.invalidateQueries(trpc.company.pathFilter());
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    const days = /^\d{1,3}$/.test(fields.terms.trim()) ? Number(fields.terms) : NaN;
    if (!(days >= 0 && days <= 365)) return setBadTerms(true);
    save.mutate({
      name: fields.name,
      address: fields.address,
      phone: fields.phone,
      email: fields.email,
      paymentInstructions: fields.paymentInstructions,
      invoiceTermsDays: days,
    });
  };
  return (
    <section aria-labelledby="settings-company" className={styles.part}>
      <h2 id="settings-company" className="heading">
        {t.settings.company}
      </h2>
      <p className={`secondary ${styles.explain}`}>{t.settings.companyExplain}</p>
      <form className={`${controls.card} ${styles.card}`} onSubmit={submit}>
        <Field id="company-name" label={t.settings.companyName}>
          <input
            id="company-name"
            className={controls.input}
            type="text"
            required
            maxLength={200}
            autoComplete="organization"
            value={fields.name}
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
        <Field id="company-address" label={t.address}>
          <textarea
            id="company-address"
            className={controls.input}
            rows={2}
            maxLength={500}
            autoComplete="street-address"
            value={fields.address}
            onChange={(e) => change({ address: e.target.value })}
          />
        </Field>
        <Field id="company-phone" label={t.phone}>
          <input
            id="company-phone"
            className={controls.input}
            type="tel"
            maxLength={32}
            autoComplete="tel"
            value={fields.phone}
            onChange={(e) => change({ phone: e.target.value })}
          />
        </Field>
        <Field id="company-email" label={t.settings.companyEmail}>
          <input
            id="company-email"
            className={controls.input}
            type="email"
            maxLength={254}
            autoComplete="email"
            value={fields.email}
            onChange={(e) => change({ email: e.target.value })}
          />
        </Field>
        <Field id="company-pay" label={t.settings.howToPay}>
          <textarea
            id="company-pay"
            className={controls.input}
            rows={4}
            maxLength={2000}
            aria-describedby="company-pay-hint"
            value={fields.paymentInstructions}
            onChange={(e) => change({ paymentInstructions: e.target.value })}
          />
          <p id="company-pay-hint" className={`secondary ${controls.caption}`}>
            {t.settings.howToPayHint}
          </p>
        </Field>
        <Field id="company-terms" label={t.settings.terms}>
          <input
            id="company-terms"
            className={controls.input}
            type="text"
            inputMode="numeric"
            maxLength={3}
            aria-invalid={badTerms}
            aria-describedby={badTerms ? "company-terms-error" : "company-terms-hint"}
            value={fields.terms}
            onChange={(e) => change({ terms: e.target.value })}
          />
          {badTerms ? (
            <p
              id="company-terms-error"
              className={`secondary ${controls.error}`}
              role="alert"
            >
              {t.settings.badTerms}
            </p>
          ) : (
            <p id="company-terms-hint" className={`secondary ${controls.caption}`}>
              {t.settings.termsHint}
            </p>
          )}
        </Field>
        <Field id="company-zone" label={t.settings.timezone}>
          <input
            id="company-zone"
            className={controls.input}
            type="text"
            readOnly
            aria-describedby="company-zone-hint"
            value={company.timezone}
          />
          <p id="company-zone-hint" className={`secondary ${controls.caption}`}>
            {t.settings.timezoneHint}
          </p>
        </Field>
        <Note text={note} />
        <button type="submit" className={controls.primary} disabled={save.isPending}>
          {t.settings.saveCompany}
        </button>
      </form>
    </section>
  );
}

// One switch of the time clock: what it does as it stands, and a button that says what
// turning it the other way will do, then asks again before it does it.
function Switch({
  name,
  on,
  is,
  turn,
  effect,
  busy,
  note,
  onFlip,
}: {
  name: string;
  on: boolean;
  is: { on: string; off: string };
  turn: { on: string; off: string };
  effect: { on: string; off: string };
  busy: boolean;
  note: string | null;
  onFlip: () => void;
}) {
  const { t } = useStrings();
  return (
    <div className={`${controls.card} ${styles.card} ${styles.switch}`}>
      <h3 className="body-strong">
        {name}{" "}
        <StatusBadge
          tone={on ? "done" : "neutral"}
          label={on ? t.settings.on : t.settings.off}
        />
      </h3>
      <p className="body">{on ? is.on : is.off}</p>
      <DestructiveAction
        label={on ? turn.off : turn.on}
        effect={on ? effect.off : effect.on}
        disabled={busy}
        onConfirm={onFlip}
      />
      <Note text={note} />
    </div>
  );
}

function Clock({ company }: { company: Company }) {
  const { t } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [note, setNote] = useState<{ on: "enforcement" | "stamps"; text: string } | null>(
    null,
  );
  const save = useMutation(trpc.company.update.mutationOptions());
  const flip = (which: "enforcement" | "stamps") => {
    setNote(null);
    save.mutate(
      which === "enforcement"
        ? { scheduleEnforced: !company.scheduleEnforced }
        : { locationStamps: !company.locationStamps },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries(trpc.company.pathFilter());
          setNote({ on: which, text: t.saved });
        },
        onError: () => setNote({ on: which, text: t.requestFailed }),
      },
    );
  };
  return (
    <section aria-labelledby="settings-clock" className={styles.part}>
      <h2 id="settings-clock" className="heading">
        {t.settings.clock}
      </h2>
      <Switch
        name={t.settings.enforcement}
        on={company.scheduleEnforced}
        is={t.settings.enforcementIs}
        turn={{ on: t.settings.enforcementTurnOn, off: t.settings.enforcementTurnOff }}
        effect={t.settings.enforcementEffect}
        busy={save.isPending}
        note={note?.on === "enforcement" ? note.text : null}
        onFlip={() => flip("enforcement")}
      />
      <Switch
        name={t.settings.stamps}
        on={company.locationStamps}
        is={t.settings.stampsIs}
        turn={{ on: t.settings.stampsTurnOn, off: t.settings.stampsTurnOff }}
        effect={t.settings.stampsEffect}
        busy={save.isPending}
        note={note?.on === "stamps" ? note.text : null}
        onFlip={() => flip("stamps")}
      />
    </section>
  );
}
