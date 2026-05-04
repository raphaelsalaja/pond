import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  FieldLabel,
  Input,
  useToast,
} from "../../ui";
import styles from "./styles.module.css";

const HOTKEY = "S"; // Cmd/Ctrl + Shift + S

/**
 * In-renderer Spotlight-style quick-capture surface. Bound to
 * Cmd+Shift+S inside the focused window. We intentionally don't ship a
 * separate BrowserWindow for v1 — the modal pattern is fast enough on
 * macOS, keeps focus management simple, and survives sleep/wake without
 * the OS reaping a long-lived hidden window.
 *
 * The hotkey reads from the system clipboard on open and pre-fills the
 * URL field if the clipboard holds a valid URL — that one detail is the
 * difference between "feels magical" and "another form to fill in".
 */
export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  // Open via either Cmd+Shift+S or a `?capture=1` query param. The
  // query param is what the future tray menu will navigate to so menu
  // bar invocations and hotkey invocations share a code path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;
      if (e.key.toUpperCase() !== HOTKEY) return;
      e.preventDefault();
      void primeFromClipboard().then((seed) => {
        if (seed) setUrl(seed);
        setOpen(true);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchParams.get("capture") === "1") {
      void primeFromClipboard().then((seed) => {
        if (seed) setUrl(seed);
        setOpen(true);
      });
      const next = new URLSearchParams(searchParams);
      next.delete("capture");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-focus when opening so the user can start typing immediately.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const reset = useCallback(() => {
    setUrl("");
    setNote("");
    setTags("");
  }, []);

  const submit = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const tagList = tags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#+/, "").toLowerCase())
        .filter(Boolean);
      const result = (await window.pond.query("saves.quickAdd", {
        url: trimmed,
        note: note.trim(),
        tags: tagList,
      })) as { ok: boolean; id?: string; error?: string };
      if (!result.ok) {
        toast.add({
          title: "Couldn't save",
          description: result.error ?? "Unknown error",
          type: "error",
        });
        return;
      }
      toast.add({
        title: "Saved to library",
        description: "Pond is fetching the rich metadata in the background.",
        type: "success",
      });
      if (result.id) navigate(`/?id=${result.id}`);
      reset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [url, note, tags, toast, navigate, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="default">
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className={styles.title}>Quick save</h2>
          <p className={styles.hint}>
            Paste a URL — Pond will fetch the rest in the background.
          </p>
          <Field>
            <FieldLabel>URL</FieldLabel>
            <Input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field>
            <FieldLabel>Note (optional)</FieldLabel>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are you saving this?"
            />
          </Field>
          <Field>
            <FieldLabel>Tags (optional)</FieldLabel>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="design, inspiration, todo"
            />
          </Field>
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={busy || !url.trim()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function primeFromClipboard(): Promise<string | null> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return null;
    const trimmed = text.trim();
    try {
      // Throws on invalid URL — we only seed when the clipboard genuinely
      // contains a URL so we don't shove arbitrary text into the field.
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  } catch {
    // Clipboard read can be blocked; that's fine.
    return null;
  }
}
