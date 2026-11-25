import { IconXmark } from "@pond/icons";
import { Button, Input, Select } from "@pond/ui";
import { isNode } from "@pond/ui/dom";
import log from "electron-log/renderer";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { chordGlyphs, SHORTCUT_PLATFORM } from "@/shared/lib/shortcuts";
import type { PondCaptureApi } from "../../../../preload/quick-capture";
import type { QuickCaptureSnapshot } from "../../../../shared/quick-capture-contracts";
import { paintShell } from "../boot-shell";
import { initialFields } from "./fields";
import type { QuickCaptureFields } from "./fields";
import { folderOptions } from "./folder-options";
import styles from "./styles.module.css";

declare global {
  interface Window {
    pondCapture?: PondCaptureApi;
  }
}

/** Long enough to read the confirmation before the window closes. */
const DONE_MS = 700;

/** macOS reads glyphs fused (⌘↵); other platforms spell keys out (Ctrl+Enter). */
const CAPTURE_KEYS = chordGlyphs("Mod+Enter").join(
  SHORTCUT_PLATFORM === "mac" ? "" : "+",
);

const CAPTURE_FAILED = "Pond couldn't add this to your Library. Try again.";

/** Folder ids are never empty, so the empty value stands for no folder. */
const INBOX = "";

const EMPTY: QuickCaptureFields = {
  text: "",
  title: "",
  paths: [],
  folderId: null,
};

function dismiss() {
  void window.pondCapture?.dismiss();
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function QuickCaptureOverlay() {
  const [snapshot, setSnapshot] = useState<QuickCaptureSnapshot | null>(null);
  const [fields, setFields] = useState<QuickCaptureFields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const folders = useMemo(() => {
    const options = folderOptions(snapshot?.folders ?? []);
    return {
      items: [
        { value: INBOX, label: "Inbox" },
        ...options.map(({ folder }) => ({
          value: folder.id,
          label: folder.name,
        })),
      ],
      rows: [
        { value: INBOX, label: "Inbox" },
        ...options.map(({ folder, depth }) => ({
          value: folder.id,
          label: `${"\u00a0\u00a0".repeat(depth)}${folder.name}`,
        })),
      ],
    };
  }, [snapshot]);
  const { text, title, paths, folderId } = fields;
  const locked = busy || Boolean(done);

  useEffect(() => {
    void window.pondCapture?.ready().then((next) => {
      if (!next) return;
      paintShell(next.shell);
      setSnapshot(next);
      setFields(initialFields(next));
      requestAnimationFrame(() => {
        void window.pondCapture?.present();
        textRef.current?.focus();
        textRef.current?.select();
      });
    });
  }, []);

  /** Main keeps every edit, so clicking away hides the window without losing the draft. */
  function edit(patch: Partial<QuickCaptureFields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    setError(null);
    void window.pondCapture?.keep(next);
  }

  function addPaths(next: Array<string>) {
    edit({ paths: [...new Set([...paths, ...next.filter(Boolean)])] });
  }

  async function submit() {
    if (locked) return;
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
    } catch (error_) {
      log.error("[pond quick-capture] capture failed", error_);
      setError(errorCopy(error_, CAPTURE_FAILED));
    } finally {
      setBusy(false);
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the whole window is a drop target and listens for Escape
    <div
      className={styles.root}
      onKeyDown={(event) => {
        /** Escape in the portaled folder list closes the list, not the window. */
        const target = event.target;
        if (!isNode(target) || !event.currentTarget.contains(target)) {
          return;
        }
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
      onDragEnter={() => void window.pondCapture?.drag("enter")}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (isNode(next) && event.currentTarget.contains(next)) {
          return;
        }
        setDragging(false);
        void window.pondCapture?.drag("leave");
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const api = window.pondCapture;
        if (!api) return;
        void api.drag("drop");
        if (!locked) {
          addPaths(
            [...event.dataTransfer.files].map((file) => api.pathForFile(file)),
          );
        }
      }}
    >
      <form
        className={styles.panel}
        data-dragging={dragging || undefined}
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
            onChange={(event) => edit({ text: event.currentTarget.value })}
            disabled={locked}
          />
        </Input.Root>
        {paths.length ? (
          <ul className={styles.files} aria-label="Files">
            {paths.map((path) => (
              <li key={path} className={styles.file} title={path}>
                <span className={styles.name}>{fileName(path)}</span>
                <Button
                  icon
                  size="xs"
                  variant="ghost"
                  aria-label={`Remove ${fileName(path)}`}
                  disabled={locked}
                  onClick={() =>
                    edit({ paths: paths.filter((entry) => entry !== path) })
                  }
                >
                  <IconXmark size={12} />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input.Root size="md">
          <Input.Field
            aria-label="Title"
            placeholder="Title (Optional)"
            value={title}
            onChange={(event) => edit({ title: event.currentTarget.value })}
            disabled={locked}
          />
        </Input.Root>
        <div className={styles.row}>
          <Select.Root
            items={folders.items}
            value={folderId ?? INBOX}
            onValueChange={(next) => {
              if (next !== null) {
                edit({ folderId: next === INBOX ? null : next });
              }
            }}
            disabled={locked}
          >
            <Select.Trigger
              size="sm"
              aria-label="Folder"
              className={styles.folder}
            >
              <Select.Value />
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner>
                <Select.Popup>
                  <Select.Items items={folders.rows} />
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={locked}
            onClick={() =>
              void window.pondCapture
                ?.pick()
                .then(addPaths)
                .catch((cause: unknown) => {
                  log.error("[pond quick-capture] pick failed", cause);
                  setError("The file picker didn't open. Try again.");
                })
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
                {done ?? `${CAPTURE_KEYS} to capture, Esc to cancel`}
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
