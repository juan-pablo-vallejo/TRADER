"use client";

// D'Sierra's work, as a grid of squares, and each photo larger on its own. A square is a
// link to the photo itself, so it opens with no script; with script the link opens the
// viewer instead: a native `<dialog>` opened modal, as the office's side panel is, so the
// page behind is inert, Tab stays inside and Escape closes it, and the browser gives the
// focus back to the square that opened it. One photo at a time, uncropped, with what it
// shows; the arrow keys and two buttons move along. No library.
import Image, { type StaticImageData } from "next/image";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useStrings } from "../i18n";
import styles from "./home.module.css";

type GalleryPhoto = { image: StaticImageData; alt: string };

export function Gallery({ photos }: { photos: GalleryPhoto[] }) {
  const { t } = useStrings();
  const dialog = useRef<HTMLDialogElement>(null);
  // Which photo the viewer shows; null while it is closed, so nothing large is fetched.
  const [at, setAt] = useState<number | null>(null);
  const total = photos.length;

  const open = (event: MouseEvent, index: number) => {
    // A new tab or a download is the visitor's choice: the link does what links do.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setAt(index);
    dialog.current?.showModal();
  };
  const step = (by: number) =>
    setAt((now) => (now === null ? now : (now + by + total) % total));
  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
  };
  const shown = at === null ? undefined : photos[at];

  return (
    <>
      <ul className={styles.gallery}>
        {photos.map((photo, index) => (
          <li key={photo.image.src}>
            <a
              className={styles.tile}
              href={photo.image.src}
              aria-label={t.home.viewPhoto(photo.alt)}
              onClick={(event) => open(event, index)}
            >
              <Image
                src={photo.image}
                alt=""
                placeholder="blur"
                sizes="(min-width: 1100px) 290px, (min-width: 768px) 33vw, 50vw"
              />
            </a>
          </li>
        ))}
      </ul>
      {/* The arrow keys are the viewer's own: they reach it from whichever button has the focus. */}
      <dialog
        ref={dialog}
        className={styles.viewer}
        aria-label={t.home.viewer}
        onClose={() => setAt(null)}
        onKeyDown={keys}
      >
        <div className={styles.viewerBar}>
          <p className={styles.viewerCount} aria-live="polite">
            {at !== null && (
              <>
                {/* The caption is said with the count; the eye reads it under the photo. */}
                <span className="visually-hidden">{`${shown?.alt ?? ""}. `}</span>
                {t.home.photoOf(at + 1, total)}
              </>
            )}
          </p>
          <button
            type="button"
            className={styles.viewerButton}
            onClick={() => dialog.current?.close()}
          >
            {t.close}
          </button>
        </div>
        {shown !== undefined && (
          <figure className={styles.viewerFigure}>
            <Image
              key={shown.image.src}
              src={shown.image}
              alt={shown.alt}
              placeholder="blur"
              sizes="100vw"
            />
            {/* Read already, as the image's name and in the count's announcement. */}
            <figcaption aria-hidden="true">{shown.alt}</figcaption>
          </figure>
        )}
        {total > 1 && (
          <div className={styles.viewerSteps}>
            <button
              type="button"
              className={styles.viewerButton}
              onClick={() => step(-1)}
            >
              {t.home.previous}
            </button>
            <button type="button" className={styles.viewerButton} onClick={() => step(1)}>
              {t.home.next}
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
