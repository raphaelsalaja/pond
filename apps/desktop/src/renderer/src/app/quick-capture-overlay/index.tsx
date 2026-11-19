import { Button, Input } from "@pond/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PondCaptureApi } from "../../../../preload/quick-capture";
import type { QuickCaptureSnapshot } from "../../../../shared/quick-capture-contracts";
import { paintShell } from "../boot-shell";
import { folderOptions } from "./folder-options";
import styles from "./styles.module.css";

declare global {
  interface Window {
    pondCapture?: PondCaptureApi;
  }
}

/** Long enough to read the confirmation before the window closes. */
const DONE_MS = 700;

function dismiss() {
  void window.pondCapture?.dismiss();
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function QuickCaptureOverlay() {
  const [snapshot, setSnapshot] = useState<QuickCaptureSnapshot | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const options = useMemo(
    () => folderOptions(snapshot?.folders ?? []),
    [snapshot],
  );

  useEffect(() => {
    void window.pondCapture?.ready().then((next) => {
      if (!next) return;
      paintShell(next.shell);
      setSnapshot(next);
      setText(next.clipboard);
      requestAnimationFrame(() => {
        void window.pondCapture?.present();
        textRef.current?.focus();
        textRef.current?.select();
      });
    });
  }, []);

  function addPaths(next: string[]) {
    setPaths((current) => [
      ...current,
      ...next.filter((path) => path && !current.includes(path)),
    ]);
    setError(null);
  }

  async function submit() {
    if (busy || done) return;
    if (!text.trim() && !paths.length) {
      setError("Add a link, some text, or a file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.pondCapture?.submit({
        text,
        paths,
        title: title.trim() || undefined,
        folderId,
      });
      const count = result?.count ?? 0;
      setDone(count === 1 ? "Captured" : `Captured ${count} Saves`);
      window.setTimeout(dismiss, DONE_MS);
    } catch {
      setError("Couldn't capture this. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole window is a drop target and listens for Escape.
    <div
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const api = window.pondCapture;
        if (!api) return;
        addPaths([...event.dataTransfer.files].map(api.pathForFile));
      }}
    >
      <form
        className={styles.panel}
        data-dragging={dragging}
        aria-label="Quick Capture"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input.Root size="md" className={styles.text}>
          <Input.Textarea
            ref={textRef}
            aria-label="Link or text"
            placeholder="Paste a link, type a note, or drop files"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            disabled={busy}
          />
        </Input.Root>
        {paths.length ? (
          <ul className={styles.files} aria-label="Files">
            {paths.map((path) => (
              <li key={path} className={styles.file} title={path}>
                <span className={styles.name}>{fileName(path)}</span>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${fileName(path)}`}
                  onClick={() =>
                    setPaths((current) =>
                      current.filter((entry) => entry !== path),
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input.Root size="md">
          <Input.Field
            aria-label="Title"
            placeholder="Title (Optional)"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            disabled={busy}
          />
        </Input.Root>
        <div className={styles.row}>
          <select
            className={styles.select}
            aria-label="Folder"
            value={folderId ?? ""}
            onChange={(event) => setFolderId(event.currentTarget.value || null)}
            disabled={busy}
          >
            <option value="">Inbox</option>
            {options.map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {`${"\u00a0\u00a0".repeat(depth)}${folder.name}`}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              void window.pondCapture?.pick().then((picked) => addPaths(picked))
            }
          >
            Add Files
          </Button>
          <span className={styles.grow}>
            {error ? (
              <span className={styles.error} role="alert">
                {error}
              </span>
            ) : (
              <span className={styles.hint} role="status">
                {done ?? "⌘↵ to capture, Esc to close"}
              </span>
            )}
          </span>
          <Button type="submit" size="sm" loading={busy} disabled={!!done}>
            Capture
          </Button>
        </div>
      </form>
    </div>
  );
}
