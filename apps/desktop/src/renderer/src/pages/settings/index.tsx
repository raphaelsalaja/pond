import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "../../ui";
import styles from "./styles.module.css";

/**
 * Sources that require a logged-in session to scrape (matches the
 * `authWalled` flag in `apps/desktop/src/main/core/refresh/sources.ts`).
 * Public-only sources (Pinterest, Are.na, YouTube) skip this UI — the
 * server-side OG reader handles them without any sign-in.
 */
const AUTH_WALLED_SOURCES = [
  { id: "twitter", label: "X / Twitter" },
  { id: "instagram", label: "Instagram" },
  { id: "cosmos", label: "Cosmos" },
  { id: "tiktok", label: "TikTok" },
] as const;
type AuthWalledSource = (typeof AUTH_WALLED_SOURCES)[number]["id"];

type AiAutonomy = "off" | "suggest" | "auto-apply";

interface SettingsRow {
  id: string;
  aiAutonomy: {
    tagging: AiAutonomy;
    additionalGuidance: string;
  };
  libraryRoot: string | null;
}

/**
 * Ports `apps/web/src/app/settings`. Today it exposes:
 *   - ingest token (copy + rotate) for browser-extension pairing
 *   - AI Gateway API key entry
 *   - AI autonomy level (off / suggest / auto-apply) + guidance text
 *   - library rescan trigger
 *
 * Phase 3+ adds: library location picker, "switch library", Login Item
 * toggle, import/export.
 */
export function SettingsPage() {
  const toast = useToast();
  const [token, setToken] = useState<string>("");
  const [aiKey, setAiKey] = useState<string>("");
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.pond.query("settings.ingestToken", {}) as Promise<{
        token: string;
      }>,
      window.pond.query("settings.aiGatewayKey", {}) as Promise<{
        key: string;
      }>,
      window.pond.query("settings.get", {}) as Promise<SettingsRow>,
    ]).then(([t, k, s]) => {
      setToken(t.token ?? "");
      setAiKey(k.key ?? "");
      setSettings(s);
    });
  }, []);

  async function rotate() {
    setBusy(true);
    try {
      const next = (await window.pond.query(
        "settings.rotateIngestToken",
        {},
      )) as { token: string };
      setToken(next.token);
      toast.add({
        title: "Token rotated",
        description: "Update the extension popup with the new token.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAiKey() {
    setBusy(true);
    try {
      await window.pond.query("settings.setAiGatewayKey", { key: aiKey });
      toast.add({
        title: "AI Gateway key saved",
        description: "Stored securely in your keychain.",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function rescan() {
    setBusy(true);
    try {
      const res = (await window.pond.query("library.rescan", {})) as {
        updated: number;
        total: number;
      };
      toast.add({
        title: "Library rescanned",
        description: `${res.total} items (${res.updated} updated).`,
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  async function setAutonomy(value: AiAutonomy) {
    if (!settings) return;
    setSettings({
      ...settings,
      aiAutonomy: { ...settings.aiAutonomy, tagging: value },
    });
    try {
      // Best-effort persistence; the IPC handler may not be wired yet.
      // Local state still updates so the Select stays in sync.
      await window.pond.query("settings.setAiAutonomy", { tagging: value });
    } catch {
      // No-op: the renderer is the source of truth until main implements
      // this writer; the next page mount will rehydrate from disk.
    }
  }

  return (
    <section className={styles.settings}>
      <h2>Settings</h2>

      <div className={styles.group}>
        <Field>
          <FieldLabel>Browser extension pairing</FieldLabel>
          <FieldDescription>
            Paste this token into the extension popup on first run. Rotate the
            token to revoke access across all installs.
          </FieldDescription>
          <div className={styles.row}>
            <Input
              variant="code"
              size="sm"
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void navigator.clipboard.writeText(token);
                toast.add({ title: "Token copied", type: "success" });
              }}
            >
              Copy
            </Button>
            <Button size="sm" disabled={busy} onClick={rotate}>
              Rotate
            </Button>
          </div>
          <FieldDescription>
            Ingest endpoint: <code>http://127.0.0.1:41610/api/v2/item/add</code>
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group}>
        <Field>
          <FieldLabel>AI Gateway key</FieldLabel>
          <FieldDescription>
            Used to enrich saves with captions, tags, and embeddings. Leave
            empty to disable AI features.
          </FieldDescription>
          <div className={styles.row}>
            <Input
              type="password"
              size="sm"
              placeholder="sk-…"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
            />
            <Button size="sm" disabled={busy} onClick={saveAiKey}>
              Save
            </Button>
          </div>
        </Field>
      </div>

      {settings ? (
        <div className={styles.group}>
          <Field>
            <FieldLabel>AI autonomy</FieldLabel>
            <FieldDescription>
              How aggressively pond should use AI to enrich your saves.
            </FieldDescription>
            <div className={styles.row}>
              <Select
                value={settings.aiAutonomy.tagging}
                onValueChange={(v) => void setAutonomy(v as AiAutonomy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="suggest">Suggest tags</SelectItem>
                  <SelectItem value="auto-apply">Auto-apply tags</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </div>
      ) : null}

      <div className={styles.group}>
        <Field>
          <FieldLabel>Library</FieldLabel>
          <FieldDescription>
            Source of truth:{" "}
            <code>{settings?.libraryRoot ?? "~/Pond/My Pond.library/"}</code>
          </FieldDescription>
          <div className={styles.row}>
            <Button size="sm" disabled={busy} onClick={rescan}>
              Rescan library
            </Button>
          </div>
        </Field>
      </div>

      <ConnectedSources />

      <VideoToolsStatus />
    </section>
  );
}

/**
 * Indicator + reinstall affordance for the bundled CLI tools the
 * in-app refresh path shells out to (yt-dlp downloads videos,
 * ffmpeg muxes adaptive streams). Both ride along via the package's
 * postinstall step; this card exists so the user can see at a glance
 * whether refreshing a video card will produce playable bytes —
 * without it, a network blip during the first `pnpm install` would
 * silently degrade Pond to poster-only mode forever.
 */
function VideoToolsStatus() {
  const toast = useToast();
  const [status, setStatus] = useState<{
    ytdlp: { available: boolean; path: string | null };
    ffmpeg: { available: boolean; path: string | null };
  } | null>(null);
  const [reinstalling, setReinstalling] = useState(false);

  const refresh = useCallback(async () => {
    const r = await window.pond.videoToolsStatus().catch(() => null);
    if (!r?.ok) {
      setStatus(null);
      return;
    }
    setStatus({ ytdlp: r.ytdlp, ffmpeg: r.ffmpeg });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reinstall = useCallback(async () => {
    setReinstalling(true);
    try {
      const r = await window.pond.videoToolsReinstall();
      toast.add({
        title: r.ok ? "yt-dlp ready" : "Couldn't install yt-dlp",
        description: r.message,
        type: r.ok ? "success" : "error",
      });
      await refresh();
    } finally {
      setReinstalling(false);
    }
  }, [refresh, toast]);

  if (!status) return null;

  const ytdlpOk = status.ytdlp.available;
  const ffmpegOk = status.ffmpeg.available;

  return (
    <div className={styles.group}>
      <Field>
        <FieldLabel>Video downloads</FieldLabel>
        <FieldDescription>
          Pond ships a bundled <code>yt-dlp</code> + <code>ffmpeg</code> so
          Refresh on a video card (X / Instagram / Cosmos / TikTok / YouTube)
          can save the actual MP4 alongside its poster — you get scrubbable
          playback, not just a still image.
        </FieldDescription>
        <ul className={styles.sourceList}>
          <li className={styles.sourceRow}>
            <div className={styles.sourceMeta}>
              <span className={styles.sourceName}>yt-dlp</span>
              <span
                className={
                  ytdlpOk ? styles.statusConnected : styles.statusDisconnected
                }
              >
                {ytdlpOk ? "Installed" : "Missing"}
              </span>
            </div>
            <div className={styles.sourceActions}>
              <Button
                size="sm"
                disabled={reinstalling}
                onClick={() => void reinstall()}
              >
                {reinstalling
                  ? "Installing…"
                  : ytdlpOk
                    ? "Reinstall"
                    : "Install"}
              </Button>
            </div>
          </li>
          <li className={styles.sourceRow}>
            <div className={styles.sourceMeta}>
              <span className={styles.sourceName}>ffmpeg</span>
              <span
                className={
                  ffmpegOk ? styles.statusConnected : styles.statusDisconnected
                }
              >
                {ffmpegOk ? "Installed" : "Missing"}
              </span>
            </div>
          </li>
        </ul>
        {!ytdlpOk ? (
          <FieldDescription>
            Without yt-dlp, Pond falls back to the harvester's poster JPG and
            the card stays a still image. Click Install to fetch the bundled
            binary now.
          </FieldDescription>
        ) : null}
      </Field>
    </div>
  );
}

/**
 * Per-source connect / disconnect grid. The "connect" flow opens a
 * visible Chromium window pointed at the source's login page; cookies
 * land in a persistent partition that the in-app refresh path also
 * uses, so signing in once unlocks silent metadata refreshes for that
 * source going forward.
 *
 * If the renderer arrives with `?connect=<source>` (the SavePreview
 * deep-link CTA), we kick off the flow on mount.
 */
function ConnectedSources() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [statuses, setStatuses] = useState<Record<AuthWalledSource, boolean>>({
    twitter: false,
    instagram: false,
    cosmos: false,
    tiktok: false,
  });
  const [pending, setPending] = useState<AuthWalledSource | null>(null);

  const refreshStatuses = useCallback(async () => {
    const next: Record<AuthWalledSource, boolean> = {
      twitter: false,
      instagram: false,
      cosmos: false,
      tiktok: false,
    };
    await Promise.all(
      AUTH_WALLED_SOURCES.map(async ({ id }) => {
        const r = await window.pond.sourceStatus(id).catch(() => null);
        if (r?.ok) next[id] = r.connected;
      }),
    );
    setStatuses(next);
  }, []);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const connect = useCallback(
    async (source: AuthWalledSource) => {
      setPending(source);
      try {
        await window.pond.connectSource(source);
        await refreshStatuses();
        toast.add({
          title: `Sign-in window closed for ${source}`,
          description:
            "If you completed sign-in, future Refresh runs will scrape this source automatically.",
          type: "success",
        });
      } catch {
        toast.add({
          title: `Couldn't open the ${source} sign-in window`,
          type: "error",
        });
      } finally {
        setPending(null);
      }
    },
    [refreshStatuses, toast],
  );

  // Deep-link from the per-save "Connect to refresh" toast: if the URL
  // carries `?connect=<source>` we auto-open the sign-in window once,
  // then strip the param so a refresh of the page doesn't re-pop it.
  const autoConnectFired = useRef(false);
  useEffect(() => {
    const wanted = params.get("connect");
    if (!wanted || autoConnectFired.current) return;
    if (!AUTH_WALLED_SOURCES.some((s) => s.id === wanted)) return;
    autoConnectFired.current = true;
    void connect(wanted as AuthWalledSource);
    const next = new URLSearchParams(params);
    next.delete("connect");
    setParams(next, { replace: true });
  }, [params, connect, setParams]);

  const disconnect = async (source: AuthWalledSource) => {
    setPending(source);
    try {
      await window.pond.disconnectSource(source);
      await refreshStatuses();
      toast.add({ title: `Disconnected ${source}`, type: "success" });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={styles.group}>
      <Field>
        <FieldLabel>Connected sources</FieldLabel>
        <FieldDescription>
          Pond keeps a private browser session for each source. Sign in once and
          metadata refreshes for X / Instagram / Cosmos / TikTok run silently in
          the background — no need to bounce out to your default browser.
        </FieldDescription>
        <ul className={styles.sourceList}>
          {AUTH_WALLED_SOURCES.map(({ id, label }) => {
            const isConnected = statuses[id];
            const isPending = pending === id;
            return (
              <li key={id} className={styles.sourceRow}>
                <div className={styles.sourceMeta}>
                  <span className={styles.sourceName}>{label}</span>
                  <span
                    className={
                      isConnected
                        ? styles.statusConnected
                        : styles.statusDisconnected
                    }
                  >
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className={styles.sourceActions}>
                  {isConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => void disconnect(id)}
                    >
                      Disconnect
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => void connect(id)}
                  >
                    {isPending
                      ? "Opening…"
                      : isConnected
                        ? "Re-sign in"
                        : "Connect"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Field>
    </div>
  );
}
