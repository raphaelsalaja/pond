import type { SharePageSave } from "@pond/schema/share-page";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { SaveView } from "../save-view";
import styles from "./styles.module.css";

export interface SaveDialogProps {
  saves: ReadonlyArray<SharePageSave>;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}

const TITLE_ID = "save-dialog-title";

/** One Save over the grid, in the browser's own modal dialog: it owns focus, Escape, and the top layer. */
export function SaveDialog({ saves, openId, onOpenChange }: SaveDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const index = openId ? saves.findIndex((save) => save.id === openId) : -1;
  const save = index >= 0 ? saves[index] : undefined;
  const isOpen = save !== undefined;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  /** Stepping to the next Save starts it from its top, like opening it would. */
  useEffect(() => {
    if (save && ref.current) ref.current.scrollTop = 0;
  }, [save]);

  const step = (delta: number) => {
    const next = saves[index + delta];
    if (next) onOpenChange(next.id);
  };

  /** Arrow keys on a focused video seek it, so they only step Saves from elsewhere. */
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const focused = document.activeElement?.tagName;
    if (focused === "VIDEO" || focused === "AUDIO") return;
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  /** The panel fills the dialog, so a click that lands on the dialog itself is on the backdrop. */
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onOpenChange(null);
  };

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={isOpen ? TITLE_ID : undefined}
      onClose={() => onOpenChange(null)}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      {save ? (
        <div className={styles.panel}>
          <div className={styles.bar}>
            <span className={styles.position}>
              {index + 1} of {saves.length}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.button}
                aria-label="Previous Save"
                disabled={index === 0}
                onClick={() => step(-1)}
              >
                <Chevron direction="left" />
              </button>
              <button
                type="button"
                className={styles.button}
                aria-label="Next Save"
                disabled={index === saves.length - 1}
                onClick={() => step(1)}
              >
                <Chevron direction="right" />
              </button>
              <button
                type="button"
                className={styles.button}
                aria-label="Close"
                onClick={() => onOpenChange(null)}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <SaveView key={save.id} save={save} heading="h2" titleId={TITLE_ID} />
        </div>
      ) : null}
    </dialog>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d={
          direction === "left"
            ? "M10 3.5L5.5 8l4.5 4.5"
            : "M6 3.5L10.5 8 6 12.5"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
