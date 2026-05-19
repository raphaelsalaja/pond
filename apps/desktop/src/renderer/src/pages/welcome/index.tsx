import {
  AlertDialog,
  Button,
  Collapsible,
  Field,
  Input,
  NumberField,
  useToast,
} from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./styles.module.css";

interface RelocatePreviewWire {
  currentPath: string;
  candidatePath: string;
  samePath: boolean;
  safety: { ok: boolean; reason: string | null };
  cloudKind: string | null;
  existing: {
    exists: boolean;
    hasItemsDir: boolean;
    hasMetadataFile: boolean;
    itemCount: number;
    looksLikePondLibrary: boolean;
  };
  suggestedMode: "copy" | "adopt";
}

type SyncSource = "twitter";

interface SyncEntry {
  state: "idle" | "running" | "done" | "error" | "auth_required";
  message?: string;
  progress?: { current: number; total: number };
  lastSyncedAt: string | null;
}

const SYNC_SOURCES: ReadonlyArray<{ id: SyncSource; label: string }> = [
  { id: "twitter", label: "Twitter / X bookmarks" },
];

export function WelcomePage() {
  const nav = useNavigate();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [port, setPort] = useState<number>(41610);

  useEffect(() => {
    void (async () => {
      const t = (await window.pond.query("settings.ingestToken")) as {
        token: string | null;
      };
      setToken(t.token ?? null);
      if (t.token) {
        const url = new URL("pond://pair");
        url.searchParams.set("port", String(port));
        url.searchParams.set("token", t.token);
        setPairing(url.toString());
      }
    })();
  }, [port]);

  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    toast.add({ title: `Copied ${what}`, type: "success" });
  }

  async function markOnboarded() {
    await window.pond.query("settings.markOnboarded", { value: true });
    nav("/");
  }

  return (
    <div className={styles.welcome}>
      <h2>Welcome to Pond</h2>
      <p className={styles.lead}>
        A local archive for the stuff you save. Everything lives on your machine
        — no cloud, no accounts.
      </p>

      <ol className={styles.steps}>
        <li>
          <h3>Pick where your library lives</h3>
          <p>
            Pond stores your saves on disk so you keep full control. Default is
            a folder in your home directory — pick somewhere in iCloud Drive (or
            Dropbox, Google Drive…) if you want your saves to sync across
            machines.
          </p>
          <LibraryLocationStep />
        </li>

        <li>
          <h3>Install the browser extension</h3>
          <p>
            Install from the Chrome / Firefox store. If you're a developer, load{" "}
            <code>apps/extension</code> as an unpacked extension.
          </p>
        </li>

        <li>
          <h3>Pair it with this app</h3>
          <p>Click the Pond icon in your browser, paste the pairing link:</p>
          <Field.Root>
            <Field.Label className={styles["sr-only"]}>
              Pairing link
            </Field.Label>
            <div className={styles.row}>
              <Input
                data-variant="code"
                readOnly
                value={pairing ?? "generating…"}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                disabled={!pairing}
                onClick={() => pairing && copy(pairing, "pairing link")}
              >
                Copy link
              </Button>
            </div>
          </Field.Root>

          <Collapsible.Root>
            <Collapsible.Trigger>Or copy token manually</Collapsible.Trigger>
            <Collapsible.Panel>
              <div className={styles["token-row"]}>
                <code>{token ?? "…"}</code>
                <Button
                  size="sm"
                  disabled={!token}
                  onClick={() => token && copy(token, "token")}
                >
                  Copy token
                </Button>
              </div>
              <p className={styles.hint}>
                Endpoint: <code>http://127.0.0.1:{port}/api/v2/item/add</code>
              </p>
              <Field.Root>
                <Field.Label>Port</Field.Label>
                <NumberField.Root
                  value={port}
                  onValueChange={(v) => setPort(v ?? 41610)}
                  min={1024}
                  max={65535}
                >
                  <NumberField.Decrement />
                  <NumberField.Input />
                  <NumberField.Increment />
                </NumberField.Root>
                <Field.Description>
                  Change only if 41610 is taken on your machine.
                </Field.Description>
              </Field.Root>
            </Collapsible.Panel>
          </Collapsible.Root>
        </li>

        <li>
          <h3>Save something</h3>
          <p>
            Right-click any page and pick "Save this page to Pond" — it'll
            appear in your library within a second.
          </p>
        </li>

        <li>
          <h3>Sync your connected apps</h3>
          <p>
            Already have bookmarks elsewhere? Connect an app from{" "}
            <strong>Settings → Connected Apps</strong> and Pond will scrape your
            full history into the local library.
          </p>
          <SyncPanel />
        </li>
      </ol>

      <div className={styles.done}>
        <Button variant="primary" size="lg" onClick={markOnboarded}>
          I'm set up → Open library
        </Button>
      </div>
    </div>
  );
}

function LibraryLocationStep() {
  const toast = useToast();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<RelocatePreviewWire | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const snap = (await window.pond
        .query("storage.snapshot", {})
        .catch(() => null)) as { libraryRoot?: string } | null;
      if (snap?.libraryRoot) setCurrentPath(snap.libraryRoot);
    })();
  }, []);

  async function chooseLocation() {
    setBusy(true);
    try {
      const pick = (await window.pond.query("library.pickFolder", {})) as
        | { ok: true; path: string }
        | { ok: false; reason: string };
      if (!pick.ok) {
        if (pick.reason !== "cancelled") {
          toast.add({
            title: "Couldn't open picker",
            description: pick.reason,
            type: "error",
          });
        }
        return;
      }
      const res = (await window.pond.query("library.previewRelocate", {
        path: pick.path,
      })) as
        | { ok: true; preview: RelocatePreviewWire }
        | { ok: false; reason: string };
      if (!res.ok) {
        toast.add({
          title: "Couldn't inspect folder",
          description: res.reason,
          type: "error",
        });
        return;
      }
      if (res.preview.samePath) {
        toast.add({
          title: "Already there",
          description: "That's the folder your library already uses.",
          type: "info",
        });
        return;
      }
      if (!res.preview.safety.ok) {
        toast.add({
          title: "Can't use that folder",
          description:
            res.preview.safety.reason === "inside_user_data"
              ? "That folder lives inside Pond's own data directory."
              : "Pond can't write to that folder.",
          type: "error",
        });
        return;
      }
      setPreview(res.preview);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    const res = (await window.pond.query("library.relocate", {
      path: preview.candidatePath,
      mode: preview.suggestedMode,
      restart: true,
    })) as { ok: true; path: string } | { ok: false; reason: string };
    if (!res.ok) {
      setBusy(false);
      toast.add({
        title: "Couldn't change location",
        description: res.reason,
        type: "error",
      });
      return;
    }
    toast.add({
      title: "Switching libraries",
      description: "Pond is restarting…",
      type: "success",
    });
  }

  const mode = preview?.suggestedMode ?? "copy";

  return (
    <div className={styles.row}>
      <code
        style={{
          flex: 1,
          padding: "6px 10px",
          fontSize: 11,
          background: "var(--ds-gray-3)",
          borderRadius: 4,
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {currentPath ?? "~/Pond/My Pond.library/"}
      </code>
      <Button size="sm" disabled={busy} onClick={() => void chooseLocation()}>
        Change…
      </Button>

      <AlertDialog.Root
        open={preview !== null}
        onOpenChange={(o) => {
          if (!o && !busy) setPreview(null);
        }}
      >
        <AlertDialog.Content>
          <AlertDialog.Title>
            {mode === "adopt"
              ? "Use this Pond library?"
              : "Move your library here?"}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {preview ? (
              <div>
                <p style={{ marginTop: 0 }}>
                  {mode === "adopt"
                    ? `That folder already looks like a Pond library (${preview.existing.itemCount} item${preview.existing.itemCount === 1 ? "" : "s"}). Pond will use it directly.`
                    : "Pond will move your library to the new location and restart. Your current folder stays put so you can confirm everything before removing it yourself."}
                </p>
                <p style={{ fontSize: 11, color: "var(--ds-gray-11)" }}>
                  <strong>From</strong> <code>{preview.currentPath}</code>
                  <br />
                  <strong>To</strong> <code>{preview.candidatePath}</code>
                </p>
                {preview.cloudKind ? (
                  <p
                    style={{
                      padding: "8px 10px",
                      background: "light-dark(#fef3c7, rgba(120, 53, 15, 0.4))",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  >
                    This folder is inside {preview.cloudKind}. Files will sync
                    across devices; Pond's index stays per-Mac.
                  </p>
                ) : null}
              </div>
            ) : null}
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <AlertDialog.Close
              render={
                <Button variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              }
            />
            <Button
              variant="primary"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {busy
                ? "Relaunching…"
                : mode === "adopt"
                  ? "Switch and Relaunch"
                  : "Move and Relaunch"}
            </Button>
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}

function SyncPanel() {
  const toast = useToast();
  const [connections, setConnections] = useState<
    Partial<Record<SyncSource, boolean>>
  >({});
  const [entries, setEntries] = useState<
    Partial<Record<SyncSource, SyncEntry>>
  >({});

  const refreshStatus = useCallback(async (src: SyncSource) => {
    const s = await window.pond.syncStatus(src).catch(() => null);
    if (!s?.ok) return;
    setEntries((prev) => ({
      ...prev,
      [src]: {
        state: s.running ? "running" : "idle",
        lastSyncedAt: s.lastSyncedAt ?? null,
      },
    }));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      for (const { id } of SYNC_SOURCES) {
        const r = await window.pond.sourceStatus(id).catch(() => null);
        if (!active) return;
        setConnections((prev) => ({
          ...prev,
          [id]: r?.ok ? r.connected : false,
        }));
        await refreshStatus(id);
      }
    })();
    const off = window.pond.onSyncStatus((upd) => {
      const src = SYNC_SOURCES.find((s) => s.id === upd.source);
      if (!src) return;
      setEntries((prev) => ({
        ...prev,
        [src.id]: {
          state: upd.state,
          message: upd.message,
          progress: upd.progress,
          lastSyncedAt: upd.lastSyncedAt ?? prev[src.id]?.lastSyncedAt ?? null,
        },
      }));
    });
    return () => {
      active = false;
      off();
    };
  }, [refreshStatus]);

  async function startSync(src: SyncSource) {
    const r = await window.pond.syncRunNow(src);
    if (!r.ok) {
      toast.add({
        title:
          r.reason === "already_running"
            ? "Sync already running"
            : "Couldn't start sync",
        type: r.reason === "already_running" ? "info" : "error",
      });
    }
  }

  async function connect(src: SyncSource) {
    await window.pond.connectSource(src);
    const r = await window.pond.sourceStatus(src).catch(() => null);
    setConnections((prev) => ({
      ...prev,
      [src]: r?.ok ? r.connected : false,
    }));
  }

  return (
    <div>
      {SYNC_SOURCES.map(({ id, label }) => {
        const connected = connections[id];
        const entry = entries[id];
        const isRunning = entry?.state === "running";
        const pct = entry?.progress
          ? Math.min(
              100,
              Math.max(
                0,
                Math.round(
                  (entry.progress.current / Math.max(entry.progress.total, 1)) *
                    100,
                ),
              ),
            )
          : null;
        return (
          <div key={id}>
            <div className={styles["backfill-row"]}>
              <div className={styles["backfill-label"]}>
                <span>{label}</span>
                <span className={styles["backfill-status"]}>
                  {connected === false
                    ? "Not connected"
                    : entry?.state === "running"
                      ? (entry.message ?? "Syncing…")
                      : entry?.state === "error"
                        ? `Failed: ${entry.message ?? "unknown"}`
                        : entry?.state === "auth_required"
                          ? "Sign in required"
                          : entry?.lastSyncedAt
                            ? "Up to date"
                            : "Ready"}
                </span>
              </div>
              {connected === false ? (
                <Button size="sm" onClick={() => void connect(id)}>
                  Connect
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={isRunning}
                  onClick={() => void startSync(id)}
                >
                  {isRunning ? "Syncing…" : "Sync all"}
                </Button>
              )}
            </div>
            {pct !== null ? (
              <div className={styles["backfill-bar"]}>
                <span
                  className={styles["backfill-bar-fill"]}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
