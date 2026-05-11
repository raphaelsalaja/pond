import type { Source, SyncCadence } from "@pond/schema/db";
import { Button, Select, useToast } from "@pond/ui";
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
            ? "Connection, import schedule, and metadata."
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
        <Settings.SectionTitle>Connection</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemDescription>
                {label} works without sign-in. No connection needed.
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
        title: `Signed in to ${getSourceLabel(source)}`,
        type: "success",
      });
    } catch {
      toast.add({
        title: `Couldn't open the sign-in window`,
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
      toast.add({
        title: `Disconnected ${getSourceLabel(source)}`,
        type: "success",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Settings.Section>
      <Settings.SectionTitle>Connection</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>
              {connected === null
                ? "Checking…"
                : connected
                  ? "Connected"
                  : "Not Connected"}
            </Settings.ItemTitle>
            <Settings.ItemDescription>
              {connected
                ? "Pond has an active session. Re-sign in if imports stop working."
                : "Sign in so Pond can import in the background."}
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
                {pending ? "Opening…" : connected ? "Re-Sign In" : "Sign In"}
              </Button>
            </div>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
    </Settings.Section>
  );
}

const CADENCE_OPTIONS: Array<{ value: SyncCadence; label: string }> = [
  { value: "off", label: "Off" },
  { value: "15min", label: "Every 15\u00A0min" },
  { value: "hourly", label: "Hourly" },
  { value: "6h", label: "Every 6\u00A0hours" },
  { value: "daily", label: "Daily" },
];

interface SyncStatusSnapshot {
  state: "idle" | "running" | "done" | "error" | "auth_required";
  message?: string;
  progress?: { current: number; total: number };
}

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
        if (s.running) setStatus({ state: "running", message: "Importing…" });
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

  function setCadence(cadence: SyncCadence) {
    const current = prefs?.[source] ?? {
      enabled: false,
      cadence: "off" as SyncCadence,
      lastSyncedAt: null,
      lastError: null,
    };
    patchPrefs({
      [source]: {
        ...current,
        cadence,
        enabled: cadence !== "off",
      },
    } as Partial<typeof prefs>);
  }

  async function importNow() {
    const r = await window.pond.syncRunNow(source);
    if (!r.ok) {
      toast.add({
        title:
          r.reason === "already_running"
            ? "Import already running"
            : "Couldn't start import",
        type: r.reason === "already_running" ? "info" : "error",
      });
    }
  }

  const isRunning =
    cfg.running ||
    status.state === "running" ||
    status.state === "auth_required";

  const statusLine = (() => {
    if (status.state === "auth_required") {
      return `Sign in to ${getSourceLabel(source)} first.`;
    }
    if (status.state === "running" && status.message) return status.message;
    if (status.state === "error" && status.message)
      return `Failed: ${status.message}`;
    if (status.state === "done" && status.message) return status.message;
    if (cfg.lastError && cfg.lastError !== "auth_required")
      return `Last run failed: ${cfg.lastError}`;
    if (cfg.lastSyncedAt)
      return `Last imported ${formatRelative(cfg.lastSyncedAt)}.`;
    return "Check for new saves and import them.";
  })();

  return (
    <Settings.Section>
      <Settings.SectionTitle>Import</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Auto-Import</Settings.ItemTitle>
            <Settings.ItemDescription>
              Automatically check for new saves on a schedule.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Select.Root<SyncCadence>
              disabled={!ready}
              value={cfg.enabled ? cfg.cadence : "off"}
              onValueChange={(v) => setCadence((v ?? "off") as SyncCadence)}
            >
              <Select.Trigger>
                <Select.Value>
                  {cfg.enabled
                    ? (CADENCE_OPTIONS.find((o) => o.value === cfg.cadence)
                        ?.label ?? "Off")
                    : "Off"}
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
            <Settings.ItemTitle>Import Now</Settings.ItemTitle>
            <Settings.ItemDescription>{statusLine}</Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <div className={styles["inline-row"]}>
              {isRunning ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void window.pond.syncCancel(source)}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={isRunning}
                onClick={() => void importNow()}
              >
                {isRunning ? "Importing…" : "Import Now"}
              </Button>
            </div>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
    </Settings.Section>
  );
}

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

function SourceRefreshCard({ source }: { source: AnySource }) {
  const toast = useToast();
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

  const scopedToThisSource =
    status.options?.source === source ||
    (status.state === "running" && status.options?.source === source);
  const isRunning = status.state === "running" && scopedToThisSource;

  async function start() {
    const res = await window.pond.refreshBackfillStart({
      source,
    });
    if (res.ok) {
      toast.add({
        title: `Refreshing ${res.total} save${res.total === 1 ? "" : "s"}`,
        type: "success",
      });
      return;
    }
    if (res.reason === "no_saves") {
      toast.add({
        title: "Nothing to refresh",
        description: "No saves found for this source.",
        type: "info",
      });
      return;
    }
    toast.add({
      title: "Refresh already running",
      type: "info",
    });
  }

  async function cancel() {
    await window.pond.refreshBackfillCancel();
  }

  const description = (() => {
    if (!scopedToThisSource && status.state === "running")
      return "A different refresh is running.";
    if (isRunning)
      return `${status.current}/${status.total} — ${status.succeeded} updated, ${status.failed} failed`;
    if (status.state === "done" && scopedToThisSource)
      return status.message ?? "Done.";
    if (status.state === "error" && scopedToThisSource)
      return status.message ?? "Error.";
    return "Re-fetch missing titles, descriptions, and media.";
  })();

  return (
    <Settings.Section>
      <Settings.SectionTitle>Metadata</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Refresh Metadata</Settings.ItemTitle>
            <Settings.ItemDescription>{description}</Settings.ItemDescription>
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
                {isRunning ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </Settings.ItemControl>
        </Settings.Item>
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
