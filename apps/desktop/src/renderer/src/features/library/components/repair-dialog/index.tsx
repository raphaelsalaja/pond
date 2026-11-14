import { Dialog } from "@pond/ui";
import type {
  LibraryRepairJob,
  LibraryRepairKind,
} from "@shared/library-repair-contracts";
import { useEffect, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import styles from "./styles.module.css";

const LABELS = {
  thumbnails: "Repair Thumbnails",
  "physical-file-names": "Repair Physical File Names",
  "invalid-content": "Repair Invalid Content",
  "save-metadata": "Repair Save Metadata",
} satisfies Record<LibraryRepairKind, string>;

const DESCRIPTIONS = {
  thumbnails:
    "Pond rebuilds missing or damaged thumbnails from each save's original file.",
  "physical-file-names":
    "Pond renames files on disk whose names other computers can't store.",
  "invalid-content":
    "Saves whose files are all missing or damaged move to Trash.",
  "save-metadata":
    "Pond rewrites the record stored with each save when it no longer matches your library.",
} satisfies Record<LibraryRepairKind, string>;

export function LibraryRepairDialog({
  kind,
  saveIds,
  open,
  onClose,
}: {
  kind: LibraryRepairKind;
  saveIds?: readonly string[];
  open: boolean;
  onClose: () => void;
}) {
  const [job, setJob] = useState<LibraryRepairJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "queued" || job?.status === "running";
  const preview = job?.preview;
  const completed = job?.phase === "apply" && job.status === "completed";

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function track(id: string): Promise<void> {
      const next = await window.pond.query("libraryRepairs.get", { id });
      if (!active || !next) return;
      setJob(next);
      if (next.status === "queued" || next.status === "running") {
        timer = setTimeout(() => void track(id), 200);
      }
    }
    void window.pond
      .query("libraryRepairs.preview", {
        kind,
        saveIds: saveIds ? [...saveIds] : undefined,
      })
      .then((next) => {
        if (!active) return;
        setJob(next);
        return track(next.id);
      })
      .catch((cause) => {
        if (active)
          setError(
            errorCopy(cause, "Pond couldn't check your library. Try again."),
          );
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [kind, saveIds]);

  async function apply(): Promise<void> {
    if (!preview) return;
    setError(null);
    try {
      const next = await window.pond.query("libraryRepairs.apply", {
        token: preview.token,
      });
      setJob(next);
      await poll(next.id);
    } catch (cause) {
      setError(
        errorCopy(cause, "Pond couldn't repair your library. Try again."),
      );
    }
  }

  async function poll(id: string): Promise<void> {
    const next = await window.pond.query("libraryRepairs.get", { id });
    if (!next) return;
    setJob(next);
    if (next.status === "queued" || next.status === "running") {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200);
      });
      await poll(id);
    }
  }

  async function close(): Promise<void> {
    if (running && job) {
      await window.pond.query("libraryRepairs.cancel", { id: job.id });
    }
    onClose();
  }

  const count = preview?.issues.length ?? 0;
  const progress =
    running && job.total > 0
      ? `${job.processed} of ${job.total}`
      : running
        ? "Checking library"
        : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) void close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>{LABELS[kind]}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>{DESCRIPTIONS[kind]}</Dialog.Description>
          <Dialog.Content className={styles.content}>
            {progress ? <p className={styles.status}>{progress}</p> : null}
            {error || job?.error ? (
              <p className={styles.error}>{error ?? job?.error}</p>
            ) : null}
            {completed ? (
              <p className={styles.status}>
                {`Repaired ${formatPlural(job.result?.repaired ?? 0, { one: "Save", other: "Saves" })}.`}
              </p>
            ) : null}
            {preview && !completed ? (
              <>
                <p className={styles.status}>
                  {count === 0
                    ? "No repairs needed."
                    : `${formatPlural(count, { one: "Save needs", other: "Saves need" })} repair.`}
                </p>
                {count > 0 ? (
                  <>
                    <div className={styles.list}>
                      {preview.issues.map((issue) => (
                        <div className={styles.issue} key={issue.id}>
                          <strong>{issue.title || issue.saveId}</strong>
                          <span>{issue.summary}</span>
                          <small>{issue.detail}</small>
                        </div>
                      ))}
                    </div>
                    <div className={styles.confirmation}>
                      <span>Pond backs up every file it changes first.</span>
                      {preview.confirmation.movesToTrash ? (
                        <span>
                          These saves move to Trash. Their folders on disk stay
                          in place.
                        </span>
                      ) : null}
                      <span>
                        {preview.confirmation.canUndo
                          ? "You can undo this repair."
                          : "You can't undo this repair."}
                      </span>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel disabled={running}>
              {completed ? "Close" : "Cancel"}
            </Dialog.Cancel>
            {!completed && count > 0 ? (
              <Dialog.Confirm
                type="button"
                loading={job?.phase === "apply" && running}
                disabled={running}
                onClick={() => void apply()}
              >
                Repair
              </Dialog.Confirm>
            ) : null}
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
