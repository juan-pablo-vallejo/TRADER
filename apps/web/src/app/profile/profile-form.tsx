"use client";

// The Profile form (DESIGN, UI components): name and contact phone as form fields; email
// read-only, captioned "Managed by your sign-in provider"; no role, company or identity
// field. `me.get` fills it, `me.update` saves it and invalidates `me.get`. Consumed by
// page.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import controls from "../controls.module.css";
import { Failure } from "../failure";
import { strings } from "../strings";
import { useTRPC } from "../trpc";
import styles from "./profile.module.css";

export function ProfileForm({ devSignIn }: { devSignIn: boolean }) {
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
        setNote(strings.saved);
        await queryClient.invalidateQueries(trpc.me.get.queryFilter());
      },
      onError: () => setNote(strings.requestFailed),
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
    <>
      <h1 className="title">{strings.profile}</h1>
      {me.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : me.isError ? (
        <Failure error={me.error} devSignIn={devSignIn} />
      ) : (
        <form className={`${controls.card} ${styles.card}`} onSubmit={submit(me.data)}>
          <div className={controls.field}>
            <label className="label" htmlFor="profile-name">
              {strings.name}
            </label>
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
          </div>
          <div className={controls.field}>
            <label className="label" htmlFor="profile-phone">
              {strings.contactPhone}
            </label>
            <input
              id="profile-phone"
              className={controls.input}
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={fields(me.data).phone}
              onChange={(e) => setDraft({ ...fields(me.data), phone: e.target.value })}
            />
          </div>
          <div className={controls.field}>
            <label className="label" htmlFor="profile-email">
              {strings.email}
            </label>
            <input
              id="profile-email"
              className={controls.input}
              type="email"
              readOnly
              value={me.data.email}
            />
            <p className={`secondary ${controls.caption}`}>{strings.managedBySignIn}</p>
          </div>
          {note !== null && (
            <p className={`secondary ${note === strings.saved ? "" : controls.error}`}>
              {note}
            </p>
          )}
          <button type="submit" className={controls.primary} disabled={save.isPending}>
            {strings.save}
          </button>
        </form>
      )}
    </>
  );
}
