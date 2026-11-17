"use client";

// Copy Last Week (DESIGN, Copy Last Week): a preview first — how many shifts will be created
// and each one left out with why — then one primary button that states the count. All are
// created or none: the confirmation names the preview by its fingerprint, and the server
// writes nothing unless that is still the plan (api assignments/copy.ts). The copy's id is
// minted once and kept, so a confirmation sent again creates nothing twice. Beneath: the
// copies that have shifts in this week, each undone whole or, once someone has clocked in on
// one of its shifts, not at all.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { uuidv7 } from "../uuidv7";
import controls from "../controls.module.css";
import { Failure } from "../failure";
import { addDays, weekDay } from "../format";
import { Note } from "../note";
import { DestructiveAction } from "../row-editor";
import { strings } from "../strings";
import { useTRPC } from "../trpc";
import { Drawer } from "./drawer";
import styles from "./schedule.module.css";
import { copiesIn, type CopyPreview, leftOutText, type Week } from "./schedule-view";

const s = strings.schedule;

const line = (o: CopyPreview["create"][number]) =>
  `${o.worker.name} · ${o.job.name} · ${weekDay(o.workDate)} ${o.expectedStart}–${o.expectedEnd}`;

export function CopyWeek({
  week,
  signInHref,
  onClose,
}: {
  week: Week;
  signInHref: string;
  onClose: (note: string | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries(trpc.assignment.pathFilter());
  const [copyId] = useState(() => uuidv7());
  const asked = useQuery(
    trpc.assignment.copyPreview.queryOptions(
      { weekStart: week.weekStart },
      // Always the plan as it is now: a preview is never shown from an earlier look.
      { staleTime: 0, gcTime: 0 },
    ),
  );
  // The plan the server answered a stale confirmation with takes the preview's place.
  const [newer, setNewer] = useState<CopyPreview | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const preview = newer ?? asked.data;

  const confirm = useMutation(
    trpc.assignment.copyConfirm.mutationOptions({
      onSuccess: async (answer) => {
        if (answer.result === "stale") {
          setNewer(answer.preview);
          setNote(s.copyStale);
          return;
        }
        await refresh();
        onClose(answer.result === "nothing" ? s.copyNothing : s.copyDone(answer.created));
      },
      // The same copy again: its id is kept, so nothing can be created twice.
      onError: () => setNote(s.copyFailed),
    }),
  );
  const undo = useMutation(
    trpc.assignment.copyUndo.mutationOptions({
      onSuccess: async (answer) => {
        await refresh();
        if (answer.result === "rejected") {
          setUndoNote(answer.code === "locked" ? s.refused.locked : s.refused.stale);
          return;
        }
        onClose(
          answer.result === "undone" ? s.undone(answer.removed) : strings.unchanged,
        );
      },
      onError: () => setUndoNote(strings.requestFailed),
    }),
  );
  const copies = copiesIn(week.shifts);
  return (
    <Drawer title={s.copyTitle} onClose={() => onClose(null)}>
      <p className="secondary">
        {s.copyExplain(weekDay(addDays(week.weekStart, -7)), weekDay(week.weekStart))}
      </p>
      {asked.isPending ? (
        <p className="body">{strings.loading}</p>
      ) : asked.isError ? (
        <Failure
          error={asked.error}
          signInHref={signInHref}
          onRetry={() => void asked.refetch()}
        />
      ) : (
        preview !== undefined && (
          <>
            {preview.create.length > 0 && (
              <>
                <h3 className="body-strong">{s.copyWillCreate(preview.create.length)}</h3>
                <ul className={styles.copyList}>
                  {preview.create.map((o) => (
                    <li key={o.sourceId} className="secondary">
                      {line(o)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.leftOut.length > 0 && (
              <>
                <h3 className="body-strong">{s.copyLeftOut(preview.leftOut.length)}</h3>
                <ul className={styles.copyList}>
                  {preview.leftOut.map((o) => (
                    <li key={o.sourceId} className="secondary">
                      {line(o)} — {leftOutText(o.reason)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className={controls.actions}>
              {preview.create.length === 0 ? (
                <p className="body">{s.copyNothing}</p>
              ) : (
                <button
                  type="button"
                  className={controls.primary}
                  disabled={confirm.isPending}
                  onClick={() => {
                    setNote(null);
                    confirm.mutate({
                      copyId,
                      weekStart: week.weekStart,
                      fingerprint: preview.fingerprint,
                    });
                  }}
                >
                  {s.copyCreate(preview.create.length)}
                </button>
              )}
            </div>
            <Note text={note} tone={note === s.copyStale ? "info" : undefined} />
          </>
        )
      )}
      {copies.length > 0 && (
        <div className={styles.remove}>
          {copies.map((copy) =>
            copy.locked ? (
              <p key={copy.copyId} className="secondary">
                {s.undoLocked(copy.count)}
              </p>
            ) : (
              <DestructiveAction
                key={copy.copyId}
                label={s.undoCopy(copy.count)}
                effect={s.undoEffect(copy.count)}
                disabled={undo.isPending}
                onConfirm={() => {
                  setUndoNote(null);
                  undo.mutate({ copyId: copy.copyId });
                }}
              />
            ),
          )}
          <Note text={undoNote} />
        </div>
      )}
    </Drawer>
  );
}
