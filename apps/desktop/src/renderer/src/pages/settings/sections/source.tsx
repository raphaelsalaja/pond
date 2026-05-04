import type { Source, SyncCadence } from "@pond/schema/db";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  getSourceLabel,
  getSourceMeta,
  SourceBadge,
} from "../../../components/source-badge";
import { usePrefs } from "../../../pool/prefs";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from "../../../ui";
import styles from "../styles.module.css";
import { Row, SectionStack, SettingsCard } from "./_shared";
import { ALL_SOURCES, type AnySource, isAuthWalled } from "./_types";

/**
 * Per-source settings page. Reads `:source` from the URL and renders
 * either the auth-walled controls (signin status + connect/disconnect)
 * or the public-source controls (rate-limit hints, refresh cadence).
 *
 * Unknown sources redirect back to the connected-accounts overview.
 */
export function SourceSection() {
  const { source: raw } = useParams<{ source: string }>();
  const source = (raw ?? "").toLowerCase();

  const known = ALL_SOURCES.some((s) => s.id === source);
  if (!known) {
    return <Navigate to="/settings/connected-accounts" replace />;
  }

  return <SourceDetail source={source as AnySource} />;
}

function SourceDetail({ source }: { source: AnySource }) {
  const meta = getSourceMeta(source);
  const label = getSourceLabel(source);

  const header = (
    <header className={styles.sourceHeader}>
      <div className={styles.sourceHeaderBadge}>
        <SourceBadge source={source} size={36} glyphSize={20} />
      </div>
      <div className={styles.sourceHeaderText}>
        <h1 className={styles.sectionTitle}>{label}</h1>
        <p className={styles.sectionDescription}>
          {meta
            ? "Per-source signin status, scrape behavior, and refresh cadence."
            : "Settings for this source."}
        </p>
      </div>
    </header>
  );

  if (isAuthWalled(source)) {
    return (
      <SectionStack>
        {header}
        <AuthWalledControls source={source} />
        {LIST_HARVEST_UI_SOURCES.has(source) ? (
          <SourceSyncCard source={source as Source} />
        ) : null}
      </SectionStack>
    );
  }

  return (
    <SectionStack>
      {header}
      <SettingsCard title="Sign in">
        <p className={styles.cardLead}>
          {label} can be scraped without sign-in — Pond uses the public
          OG/oEmbed reader for these saves.
        </p>
      </SettingsCard>
      {LIST_HARVEST_UI_SOURCES.has(source) ? (
        <SourceSyncCard source={source as Source} />
      ) : null}
    </SectionStack>
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
    <SettingsCard title="Sign in">
      <Row
        label="Status"
        description="Pond keeps a private browser session for this source. Sign in once and refreshes run silently in the background."
        control={
          <span
            className={
              connected ? styles.statusConnected : styles.statusDisconnected
            }
          >
            {connected === null
              ? "Checking…"
              : connected
                ? "Connected"
                : "Not connected"}
          </span>
        }
      />
      <Row
        label={connected ? "Re-sign in or disconnect" : "Connect now"}
        description={
          connected
            ? "Re-sign in if Pond stops scraping this source — typically after a logout or password change."
            : "Pop a private browser window to complete the sign-in flow."
        }
        control={
          <div className={styles.inlineRow}>
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
            <Button size="sm" disabled={pending} onClick={() => void connect()}>
              {pending ? "Opening…" : connected ? "Re-sign in" : "Connect"}
            </Button>
          </div>
        }
      />
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/* Sync card.                                                          */
/* ------------------------------------------------------------------ */

const CADENCE_OPTIONS: Array<{ value: SyncCadence; label: string }> = [
  { value: "off", label: "Off" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "6h", label: "Every 6 hours" },
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

  async function syncNow(mode: "incremental" | "backfill" = "incremental") {
    const r = await window.pond.syncRunNow(source, mode);
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
    <SettingsCard title="Sync">
      <Row
        label="Background sync"
        description="When enabled, Pond opens your bookmarks list on a hidden Chromium window using the cookies above and imports anything new."
        control={
          <Switch
            disabled={!ready}
            checked={cfg.enabled}
            onCheckedChange={(checked) =>
              patchSync({ enabled: Boolean(checked) })
            }
          />
        }
      />
      <Row
        label="Cadence"
        description="How often the scheduler kicks off an incremental run. The hidden window stops scrolling the moment it sees a tweet you already have."
        control={
          <Select<SyncCadence>
            value={cfg.cadence}
            onValueChange={(v) =>
              patchSync({ cadence: (v ?? "off") as SyncCadence })
            }
          >
            <SelectTrigger>
              <SelectValue>
                {CADENCE_OPTIONS.find((o) => o.value === cfg.cadence)?.label ??
                  "Off"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CADENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Row
        label="Sync now"
        description={
          cfg.lastSyncedAt
            ? `Last synced ${formatRelative(cfg.lastSyncedAt)}.`
            : "No runs yet."
        }
        control={
          <div className={styles.inlineRow}>
            <Button
              size="sm"
              variant="ghost"
              disabled={isRunning}
              onClick={() => void syncNow("backfill")}
            >
              Backfill all
            </Button>
            <Button
              size="sm"
              disabled={isRunning}
              onClick={() => void syncNow("incremental")}
            >
              {isRunning ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        }
      />
      {inlineMessage ? (
        <Row
          label="Status"
          description={inlineMessage}
          control={
            isRunning ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void window.pond.syncCancel(source)}
              >
                Cancel
              </Button>
            ) : (
              <span />
            )
          }
        />
      ) : null}
    </SettingsCard>
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
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
