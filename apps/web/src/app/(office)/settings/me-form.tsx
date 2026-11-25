"use client";

// Settings' third part, Me: name and contact phone as form fields, and the language;
// email read-only, captioned "Managed by your sign-in provider"; no role, company or
// identity field. `me.get` fills it, `me.update` saves it and invalidates `me.get`. The
// language is kept on this browser and changes at once. Consumed by settings-screen.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../../controls.module.css";
import { blocking, Failure, RefreshFailed } from "../../failure";
import { LoadingRows } from "../../loading-rows";
import { Field } from "../../field";
import { signInPhone } from "../../format";
import { Note } from "../../note";
import { useStrings } from "../../i18n";
import { LANGUAGES, type Language } from "../../i18n/language";
import { useTRPC } from "../../trpc";
import styles from "./settings.module.css";
import { WriteButton } from "../../write-button";

export function MeForm({ signInHref }: { signInHref: string }) {
  const { t, language, setLanguage } = useStrings();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useQuery(trpc.me.get.queryOptions());
  // What the person has typed, or null: then the fields show the record as fetched. A save
  // clears the draft, so the refetched record is what the form shows next.
  const [draft, setDraft] = useState<{ name: string; phone: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const save = useMutation(
    trpc.me.update.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        setNote(t.saved);
        await queryClient.invalidateQueries(trpc.me.get.queryFilter());
      },
      onError: () => setNote(t.requestFailed),
    }),
  );
  const fields = (record: { name: string; phone: string | null }) =>
    draft ?? { name: record.name, phone: record.phone ?? "" };
  const submit = (record: { name: string; phone: string | null }) => (e: FormEvent) => {
    e.preventDefault();
    const { name, phone } = fields(record);
    setNote(null);
    save.mutate({ name, phone: phone === "" ? null : phone });
  };
  return (
    <section aria-labelledby="settings-me" className={styles.part}>
      <h2 id="settings-me" className="heading">
        {t.settings.me}
      </h2>
      <RefreshFailed reads={[me]} />
      {me.isPending ? (
        <LoadingRows rows={3} />
      ) : blocking([me]) !== undefined || me.data === undefined ? (
        <Failure
          error={me.error}
          signInHref={signInHref}
          onRetry={() => void me.refetch()}
        />
      ) : (
        <form className={`${controls.card} ${styles.card}`} onSubmit={submit(me.data)}>
          <Field id="profile-name" label={t.name}>
            <input
              id="profile-name"
              className={controls.input}
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              value={fields(me.data).name}
              onChange={(e) => setDraft({ ...fields(me.data), name: e.target.value })}
            />
          </Field>
          <Field id="profile-phone" label={t.contactPhone}>
            <input
              id="profile-phone"
              className={controls.input}
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={fields(me.data).phone}
              onChange={(e) => setDraft({ ...fields(me.data), phone: e.target.value })}
            />
          </Field>
          {me.data.signInPhone !== null && (
            <Field id="profile-sign-in-phone" label={t.signInNumber}>
              <input
                id="profile-sign-in-phone"
                className={controls.input}
                type="tel"
                readOnly
                value={signInPhone(me.data.signInPhone)}
              />
              <p className={`secondary ${controls.caption}`}>{t.signInNumberCaption}</p>
            </Field>
          )}
          {me.data.email !== null && (
            <Field id="profile-email" label={t.email}>
              <input
                id="profile-email"
                className={controls.input}
                type="email"
                readOnly
                value={me.data.email}
              />
              <p className={`secondary ${controls.caption}`}>{t.managedBySignIn}</p>
            </Field>
          )}
          {/* Kept on this browser, and changed at once: it is not part of the record
              the button below saves. */}
          <Field id="profile-language" label={t.language}>
            <select
              id="profile-language"
              className={controls.select}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l} lang={l}>
                  {t.languages[l]}
                </option>
              ))}
            </select>
          </Field>
          <Note text={note} />
          <WriteButton
            type="submit"
            className={controls.primary}
            pending={save.isPending}
          >
            {t.save}
          </WriteButton>
        </form>
      )}
    </section>
  );
}
