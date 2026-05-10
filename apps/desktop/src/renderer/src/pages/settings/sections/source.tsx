import type { Source, SyncCadence } from "@pond/schema/db";
import { Button, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Settings } from "@/components/settings";
import {
  getSourceLabel,
  getSourceMeta,
  SourceBadge,
} from "@/components/source-badge";
import styles from "@/pages/settings/styles.module.css";
import { usePrefs } from "@/pool/prefs";
import type { RefreshBackfillStatusWire } from "../../../../../preload";
import { ALL_SOURCES, type AnySource, isAuthWalled } from "./_types";

/**
 * Per-source settings page. Reads `:source` from the URL and renders
 * either the auth-walled controls (signin status + connect/disconnect)
 * or the public-source controls (rate-limit hints, refresh cadence).
 *
 * Unknown sources redirect back to the integrations overview.
 */
export function SourceSection() {
  const { source: raw } = useParams<{ source: string }>();
  const source = (raw ?? "").toLowerCase();

  const known = ALL_SOURCES.some((s) => s.id === source);
  if (!known) {
    return <Navigate to="/settings/integrations" replace />;
  }

  return <SourceDetail source={source as AnySource} />;
}

function SourceDetail({ source }: { source: AnySource }) {
  const meta = getSourceMeta(source);
  const label = getSourceLabel(source);

  const header = (
    <header className={styles["source-header"]}>
      <div className={styles["source-header-badge"]}>
        <SourceBadge.Root source={source} data-size="lg" />
      </div>
      <div className={styles["source-header-text"]}>
        <Settings.Title>{label}</Settings.Title>
        <Settings.Description>
          {meta
            ? "Sign-in status, scrape behavior, and refresh cadence."
            : "Settings for this source."}
        </Settings.Description>
      </div>
    </header>
  );

  if (isAuthWalled(source)) {
    return (
      <Settings.Page>
        {header}
        <AuthWalledControls source={source} />
        {LIST_HARVEST_UI_SOURCES.has(source) ? (
          <SourceSyncCard source={source as Source} />
        ) : null}
        <SourceRefreshCard source={source} />
      </Settings.Page>
    );
  }

  return (
    <Settings.Page>
      {header}
      <Settings.Section>
        <Settings.SectionTitle>Sign In</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemDescription>
                {label} scrapes without sign-in via the public OG and oEmbed
                reader.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
      {LIST_HARVEST_UI_SOURCES.has(source) ? (
        <SourceSyncCard source={source as Source} />
      ) : null}
      <SourceRefreshCard source={source} />
    </Settings.Page>
  );
}

/**
 * Sources with a list-harvest sync card. Mirrors
 * `LIST_HARVEST_SOURCES` on the main side (`core/sync/index.ts`) plus
 * Twitter (which has its own bookmarks-list harvester).
 */
const LIST_HARVEST_UI_SOURCES = new Set<string>([
  "twitter",
  "youtube",
  "cosmos",
  "arena",
  "pinterest",
  "instagram",
  "reddit",
  "tiktok",
]);

function AuthWalledControls({ source }: { source: AnySource }) {
  const toast = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const r = await window.pond.sourceStatus(source).catch(() => null);
    setConnected(r?.ok ? r.connected : false);
  }, [source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connect() {
    setPending(true);
    try {
      await window.pond.connectSource(source);
      await refresh();
      toast.add({
        title: `Sign-in window closed for ${source}`,
        description: "Future refreshes scrape this source after sign-in.",
        type: "success",
      });
    } catch {
      toast.add({
        title: `Couldn't open the ${source} sign-in window`,
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    setPending(true);
    try {
      await window.pond.disconnectSource(source);
      await refresh();
      toast.add({ title: `Disconnected ${source}`, type: "success" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Settings.Section>
      <Settings.SectionTitle>Sign In</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Status</Settings.ItemTitle>
            <Settings.ItemDescription>
              Pond keeps a private browser session for this source. One sign-in
              keeps refreshes silent in the background.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <span
              className={
                connected
                  ? styles["status-connected"]
                  : styles["status-disconnected"]
              }
            >
              {connected === null
                ? "Checking…"
                : connected
                  ? "Connected"
                  : "Not Connected"}
            </span>
          </Settings.ItemControl>
        </Settings.Item>

        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>
              {connected ? "Re-Sign In or Disconnect" : "Connect Now"}
            </Settings.ItemTitle>
            <Settings.ItemDescription>
              {connected
                ? "Re-sign in if Pond stops scraping this source, usually after a logout or password change."
                : "Open a private browser window to sign in."}
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <div className={styles["inline-row"]}>
              {connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={pending}
                onClick={() => void connect()}
              >
                {pending ? "Opening…" : connected ? "Re-Sign In" : "Connect"}
              </Button>
            </div>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
    </Settings.Section>
  );
}

/* ------------------------------------------------------------------ */
/* Sync card.                                                          */
/* ------------------------------------------------------------------ */

const CADENCE_OPTIONS: Array<{ value: SyncCadence; label: string }> = [
  { value: "off", label: "Off" },
  { value: "15min", label: "Every 15\u00A0minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "6h", label: "Every 6\u00A0hours" },
  { value: "daily", label: "Daily" },
];

interface SyncStatusSnapshot {
  state: "idle" | "running" | "done" | "error" | "auth_required";
  message?: string;
  progress?: { current: number; total: number };
}

/**
 * Per-source sync card. Drives `IPC.syncRunNow` /`syncStatus` /
 * `syncCancel` and the `prefs.sync[source]` toggle. Originally written
 * for Twitter (`TwitterSyncCard`), now generalised so every Phase-3
 * list-harvest source ("youtube", "cosmos", "arena", …) can use the
 * exact same UI.
 *
 * Aliased as `TwitterSyncCard` for back-compat with any callers that
 * still reference it by the old name.
 */
function SourceSyncCard({ source }: { source: Source }) {
  const toast = useToast();
  const [prefs, patchPrefs, ready] = usePrefs("sync");
  const [status, setStatus] = useState<SyncStatusSnapshot>({ state: "idle" });
  const [snapshot, setSnapshot] = useState<{
    enabled: boolean;
    cadence: SyncCadence;
    lastSyncedAt: string | null;
    lastError: string | null;
    running: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void window.pond.syncStatus(source).then((s) => {
      if (!active) return;
      if (s.ok) {
        setSnapshot({
          enabled: s.enabled,
          cadence: (s.cadence as SyncCadence) ?? "off",
          lastSyncedAt: s.lastSyncedAt ?? null,
          lastError: s.lastError ?? null,
          running: s.running,
        });
        if (s.running) setStatus({ state: "running", message: "Syncing…" });
      }
    });
    const off = window.pond.onSyncStatus((upd) => {
      if (upd.source !== source) return;
      setStatus({
        state: upd.state,
        message: upd.message,
        progress: upd.progress,
      });
      if (
        upd.state === "done" ||
        upd.state === "error" ||
        upd.state === "auth_required"
      ) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                running: false,
                lastSyncedAt: upd.lastSyncedAt ?? prev.lastSyncedAt,
                lastError: upd.lastError ?? null,
              }
            : prev,
        );
      }
      if (upd.state === "running") {
        setSnapshot((prev) => (prev ? { ...prev, running: true } : prev));
      }
    });
    return () => {
      active = false;
      off();
    };
  }, [source]);

  // Pref bucket may be undefined on first paint; merge with snapshot
  // so the controls always have a deterministic value to bind to.
  const cfg = useMemo(() => {
    const fromPrefs = prefs?.[source];
    const fromSnap = snapshot;
    return {
      enabled: fromPrefs?.enabled ?? fromSnap?.enabled ?? false,
      cadence: (fromPrefs?.cadence ??
        fromSnap?.cadence ??
        "off") as SyncCadence,
      lastSyncedAt: fromSnap?.lastSyncedAt ?? fromPrefs?.lastSyncedAt ?? null,
      lastError: fromSnap?.lastError ?? fromPrefs?.lastError ?? null,
      running: fromSnap?.running ?? false,
    };
  }, [prefs, snapshot, source]);

  function patchSync(next: { enabled?: boolean; cadence?: SyncCadence }) {
    const current = prefs?.[source] ?? {
      enabled: false,
      cadence: "off" as SyncCadence,
      lastSyncedAt: null,
      lastError: null,
    };
    patchPrefs({
      [source]: {
        ...current,
        ...next,
      },
    } as Partial<typeof prefs>);
  }

  async function syncNow() {
    const r = await window.pond.syncRunNow(source);
    if (!r.ok) {
      if (r.reason === "already_running") {
        toast.add({
          title: "Sync already running",
          description: "Wait for the current run to finish.",
          type: "info",
        });
      } else {
        toast.add({
          title: "Couldn't start sync",
          type: "error",
        });
      }
    }
  }

  const isRunning =
    cfg.running ||
    status.state === "running" ||
    status.state === "auth_required";
  const inlineMessage = (() => {
    if (status.state === "auth_required") {
      return `Sign in to ${getSourceLabel(source)} to enable background sync.`;
    }
    if (status.state === "running" && status.message) {
      return status.message;
    }
    if (status.state === "error" && status.message) {
      return `Last run failed: ${status.message}`;
    }
    if (status.state === "done" && status.message) {
      return status.message;
    }
    if (cfg.lastError && cfg.lastError !== "auth_required") {
      return `Last run failed: ${cfg.lastError}`;
    }
    return null;
  })();

  return (
    <Settings.Section>
      <Settings.SectionTitle>Sync</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Background Sync</Settings.ItemTitle>
            <Settings.ItemDescription>
              Open your bookmarks list on a hidden Chromium window using the
              cookies above and import anything new.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              disabled={!ready}
              checked={cfg.enabled}
              onCheckedChange={(checked) =>
                patchSync({ enabled: Boolean(checked) })
              }
            />
          </Settings.ItemControl>
        </Settings.Item>

        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Cadence</Settings.ItemTitle>
            <Settings.ItemDescription>
              How often the scheduler runs an incremental sync.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Select.Root<SyncCadence>
              value={cfg.cadence}
              onValueChange={(v) =>
                patchSync({ cadence: (v ?? "off") as SyncCadence })
              }
            >
              <Select.Trigger>
                <Select.Value>
                  {CADENCE_OPTIONS.find((o) => o.value === cfg.cadence)
                    ?.label ?? "Off"}
                </Select.Value>
              </Select.Trigger>
              <Select.Content>
                {CADENCE_OPTIONS.map((o) => (
                  <Select.Item key={o.value} value={o.value}>
                    {o.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Settings.ItemControl>
        </Settings.Item>

        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Sync Now</Settings.ItemTitle>
            <Settings.ItemDescription>
              {cfg.lastSyncedAt
                ? `Last synced ${formatRelative(cfg.lastSyncedAt)}.`
                : "No runs yet."}
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              disabled={isRunning}
              onClick={() => void syncNow()}
            >
              {isRunning ? "Syncing…" : "Sync Now"}
            </Button>
          </Settings.ItemControl>
        </Settings.Item>

        {inlineMessage ? (
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Status</Settings.ItemTitle>
              <Settings.ItemDescription>
                {inlineMessage}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              {isRunning ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void window.pond.syncCancel(source)}
                >
                  Cancel
                </Button>
              ) : (
                <span />
              )}
            </Settings.ItemControl>
          </Settings.Item>
        ) : null}
      </Settings.List>
    </Settings.Section>
  );
}

/* ------------------------------------------------------------------ */
/* Metadata refresh card.                                              */
/* ------------------------------------------------------------------ */

const IDLE_REFRESH: RefreshBackfillStatusWire = {
  state: "idle",
  total: 0,
  current: 0,
  succeeded: 0,
  failed: 0,
  authRequired: [],
  startedAt: null,
  finishedAt: null,
  options: {},
};

/**
 * Per-source metadata refresh. Re-runs the per-save refresh pipeline
 * (server-side OG → hidden Chromium harvester → yt-dlp) scoped to a
 * single source. Talks to `core/refresh/backfill.ts` over the
 * `pond:refresh-backfill-*` IPC channels with `{ source }` set.
 *
 * The global "refresh every source" affordance lives on the
 * Integrations index page.
 */
function SourceRefreshCard({ source }: { source: AnySource }) {
  const toast = useToast();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [status, setStatus] = useState<RefreshBackfillStatusWire>(IDLE_REFRESH);

  useEffect(() => {
    let cancelled = false;
    void window.pond.refreshBackfillStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    const off = window.pond.onRefreshBackfillStatus((s) => {
      setStatus(s);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Only treat the run as ours when the active backfill targets this
  // very source — a global run streams to every per-source page too.
  const scopedToThisSource =
    status.options?.source === source ||
    (status.state === "running" && status.options?.source === source);
  const isRunning = status.state === "running" && scopedToThisSource;

  const pct = useMemo(() => {
    if (!isRunning || status.total === 0) return 0;
    return Math.min(100, Math.round((status.current / status.total) * 100));
  }, [isRunning, status.total, status.current]);

  async function start() {
    const res = await window.pond.refreshBackfillStart({
      source,
      onlyMissing,
    });
    if (res.ok) {
      toast.add({
        title: `Refreshing ${res.total} save${res.total === 1 ? "" : "s"}`,
        description: "Progress streams here; leaving the page is fine.",
        type: "success",
      });
      return;
    }
    if (res.reason === "no_saves") {
      toast.add({
        title: "Nothing to refresh",
        description: onlyMissing
          ? "No saves for this source are missing metadata."
          : "No saves for this source.",
        type: "info",
      });
      return;
    }
    toast.add({
      title: "Refresh already running",
      description: "Wait for the current run to finish or cancel it first.",
      type: "info",
    });
  }

  async function cancel() {
    await window.pond.refreshBackfillCancel();
  }

  const summary = (() => {
    if (!scopedToThisSource && status.state === "running") {
      return "A different refresh is running.";
    }
    if (status.state === "running") return status.message ?? "Working…";
    if (status.state === "done" && scopedToThisSource)
      return status.message ?? "Done.";
    if (status.state === "cancelled" && scopedToThisSource)
      return status.message ?? "Cancelled.";
    if (status.state === "error" && scopedToThisSource)
      return status.message ?? "Error.";
    return `Re-run the OG, hidden-window, and yt-dlp pipeline for every ${getSourceLabel(source)} save.`;
  })();

  return (
    <Settings.Section>
      <Settings.SectionTitle>Metadata Refresh</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>
              Only Saves with Missing Fields
            </Settings.ItemTitle>
            <Settings.ItemDescription>
              Skip rows that already have title, description, and a media URL.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              checked={onlyMissing}
              onCheckedChange={(v) => setOnlyMissing(Boolean(v))}
            />
          </Settings.ItemControl>
        </Settings.Item>

        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Run Refresh Now</Settings.ItemTitle>
            <Settings.ItemDescription>{summary}</Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <div className={styles["inline-row"]}>
              {isRunning ? (
                <Button size="sm" variant="ghost" onClick={() => void cancel()}>
                  Cancel
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={status.state === "running"}
                onClick={() => void start()}
              >
                {isRunning
                  ? `${status.current}/${status.total}`
                  : "Refresh Metadata"}
              </Button>
            </div>
          </Settings.ItemControl>
        </Settings.Item>

        {isRunning && status.total > 0 ? (
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Progress</Settings.ItemTitle>
              <Settings.ItemDescription>
                {`${status.succeeded} updated · ${status.failed} failed`}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <span
                aria-live="polite"
                style={{ minWidth: 56, textAlign: "right" }}
              >
                {pct}%
              </span>
            </Settings.ItemControl>
          </Settings.Item>
        ) : null}
      </Settings.List>
    </Settings.Section>
  );
}

/**
 * Cheap relative-timestamp formatter. We don't want to drag in a date
 * lib just for "5 minutes ago"; this covers the buckets the renderer
 * actually shows.
 */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "recently";
  const delta = Date.now() - t;
  if (delta < 0) return "just now";
  const min = Math.round(delta / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}\u00A0minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}\u00A0hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.round(hr / 24);
  return `${d}\u00A0day${d === 1 ? "" : "s"} ago`;
}
