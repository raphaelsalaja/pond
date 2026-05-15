import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import { Button, Input, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineRow } from "@/components/inline-row";
import { Settings } from "@/components/settings";
import { getSourceLabel } from "@/components/source-badge";
import { usePrefs } from "@/pool/prefs";
import type {
  RefreshBackfillStatusWire,
  StorageGuardStatusWire,
} from "../../../../../../preload";
import { DEFAULT_VIDEO_DOWNLOAD, type SettingsRow } from "../_types";
import styles from "./styles.module.css";

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

interface IntegrityReport {
  orphans: string[];
  missing: string[];
  errors: Record<string, string>;
  totalIndexed: number;
  totalOnDisk: number;
}

interface StorageSnapshotWire {
  pondBytes: number;
  breakdown: {
    items: number;
    videoCache: number;
    thumbs: number;
    meta: number;
    db: number;
    other: number;
  };
  deviceTotalBytes: number;
  deviceFreeBytes: number;
  deviceUsedByOthersBytes: number;
  libraryRoot: string;
  computedAt: string;
}

type BreakdownKey = keyof StorageSnapshotWire["breakdown"];

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  items: "Items",
  videoCache: "Video cache",
  thumbs: "Thumbnails",
  meta: "Metadata",
  db: "Database",
  other: "Other",
};

const BREAKDOWN_SEGMENT_CLASS: Record<BreakdownKey, string> = {
  items: styles["usage-bar-segment-items"] ?? "",
  videoCache: styles["usage-bar-segment-video-cache"] ?? "",
  thumbs: styles["usage-bar-segment-thumbs"] ?? "",
  meta: styles["usage-bar-segment-meta"] ?? "",
  db: styles["usage-bar-segment-db"] ?? "",
  other: styles["usage-bar-segment-other"] ?? "",
};

const BREAKDOWN_ORDER: BreakdownKey[] = [
  "items",
  "videoCache",
  "thumbs",
  "meta",
  "db",
  "other",
];

const ACTION_LABELS: Record<
  "warn" | "pauseSync" | "pauseVideo",
  { label: string; description: string }
> = {
  warn: { label: "Notify Me", description: "Show a warning only." },
  pauseSync: {
    label: "Pause Source Syncs",
    description: "Stop background syncs until usage drops.",
  },
  pauseVideo: {
    label: "Pause Auto Video Downloads",
    description: "Skip yt-dlp until usage drops.",
  },
};

export function StorageSection() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);

  const [snapshot, setSnapshot] = useState<StorageSnapshotWire | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [storagePrefs, patchStorage] = usePrefs("storage");
  const [libraryPrefs, patchLibrary] = usePrefs("library");
  const [guardStatus, setGuardStatus] = useState<StorageGuardStatusWire | null>(
    null,
  );

  useEffect(() => {
    void window.pond.query("settings.get", {}).then((s) => {
      const row = s as SettingsRow;
      setSettings({
        ...row,
        videoDownload: row.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
      });
    });
  }, []);

  const fetchSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const next = (await window.pond.query(
        "storage.snapshot",
        {},
      )) as StorageSnapshotWire;
      setSnapshot(next);
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : String(err));
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    void window.pond.query("storage.guardState", {}).then((s) => {
      if (s) setGuardStatus(s as StorageGuardStatusWire);
    });
    const off = window.pond.onStorageStatus((s) => setGuardStatus(s));
    return off;
  }, []);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function rescan() {
    await withBusy("rescan", async () => {
      const res = (await window.pond.query("library.rescan", {})) as {
        updated: number;
        total: number;
      };
      toast.add({
        title: "Library rescanned",
        description: `${res.total}\u00A0items, ${res.updated}\u00A0updated.`,
        type: "success",
      });
      await fetchSnapshot();
    });
  }

  async function openInFinder() {
    await window.pond.query("library.openInFinder", {});
  }

  async function move() {
    await withBusy("move", async () => {
      const res = (await window.pond.query("library.move", {})) as
        | { ok: true; path: string }
        | { ok: false; reason: string };
      if (!res.ok) {
        if (res.reason !== "cancelled") {
          toast.add({
            title: "Move failed",
            description: res.reason,
            type: "error",
          });
        }
        return;
      }
      toast.add({
        title: "Library copied",
        description: "Restart Pond to use the new location.",
        type: "success",
      });
    });
  }

  async function verify() {
    await withBusy("verify", async () => {
      const res = (await window.pond.query("library.verifyIntegrity", {})) as
        | (IntegrityReport & { ok: true })
        | { ok: false; reason: string };
      if (!res.ok) {
        toast.add({
          title: "Verification failed",
          description: res.reason,
          type: "error",
        });
        return;
      }
      setReport({
        orphans: res.orphans,
        missing: res.missing,
        errors: res.errors,
        totalIndexed: res.totalIndexed,
        totalOnDisk: res.totalOnDisk,
      });
      const drift = res.orphans.length + res.missing.length;
      toast.add({
        title: drift === 0 ? "Library is clean" : "Drift detected",
        description:
          drift === 0
            ? `${res.totalIndexed}\u00A0items match on disk and in the index.`
            : `${res.orphans.length} on disk only · ${res.missing.length} indexed only.`,
        type: drift === 0 ? "success" : "warning",
      });
    });
  }

  function applyStoragePrefsPatch(patch: Partial<typeof storagePrefs>) {
    patchStorage(patch);
    void window.pond.query("storage.applyGuardPrefs", {}).catch(() => {
      // Watcher rearm errors get logged in main; UI stays responsive.
    });
  }

  const usagePercents = useMemo(() => {
    if (!snapshot || snapshot.deviceTotalBytes <= 0) return null;
    const total = snapshot.deviceTotalBytes;
    const segments: { key: string; pct: number; className: string }[] = [];
    for (const key of BREAKDOWN_ORDER) {
      const bytes = snapshot.breakdown[key];
      if (bytes <= 0) continue;
      segments.push({
        key,
        pct: (bytes / total) * 100,
        className: BREAKDOWN_SEGMENT_CLASS[key],
      });
    }
    const otherDevice = Math.max(0, snapshot.deviceUsedByOthersBytes);
    if (otherDevice > 0) {
      segments.push({
        key: "device-others",
        pct: (otherDevice / total) * 100,
        className: styles["usage-bar-segment-device"] ?? "",
      });
    }
    return segments;
  }, [snapshot]);

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Storage</Settings.Title>
        <Settings.Description>
          Where saves live on disk and how Pond manages them.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Disk Usage</Settings.SectionTitle>
        <div className={styles["usage-headline"]}>
          <div className={styles["usage-stat"]}>
            <span className={styles["usage-stat-value"]}>
              {snapshot ? formatBytes(snapshot.pondBytes) : "…"}
            </span>
            <span className={styles["usage-stat-label"]}>used by Pond</span>
          </div>
          <div className={styles["usage-stat"]}>
            <span className={styles["usage-stat-value"]}>
              {snapshot ? formatBytes(snapshot.deviceFreeBytes) : "…"}
            </span>
            <span className={styles["usage-stat-label"]}>
              free on this device
            </span>
          </div>
          {snapshot ? (
            <div className={styles["usage-stat"]}>
              <span className={styles["usage-stat-value"]}>
                {formatBytes(snapshot.deviceTotalBytes)}
              </span>
              <span className={styles["usage-stat-label"]}>
                total on this device
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles["usage-bar"]} aria-hidden>
          {usagePercents
            ? usagePercents.map((seg) => (
                <div
                  key={seg.key}
                  className={[styles["usage-bar-segment"], seg.className]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ flexBasis: `${seg.pct}%` }}
                  title={`${seg.key}: ${seg.pct.toFixed(1)}%`}
                />
              ))
            : null}
        </div>
        <div className={styles["usage-legend"]}>
          {BREAKDOWN_ORDER.map((key) => (
            <div className={styles["usage-legend-item"]} key={key}>
              <span className={styles["usage-legend-label"]}>
                <span
                  className={[
                    styles["usage-legend-swatch"],
                    BREAKDOWN_SEGMENT_CLASS[key],
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                {BREAKDOWN_LABELS[key]}
              </span>
              <span className={styles["usage-legend-value"]}>
                {snapshot
                  ? formatBytes(snapshot.breakdown[key])
                  : snapshotLoading
                    ? "Calculating…"
                    : "…"}
              </span>
            </div>
          ))}
          <div className={styles["usage-legend-item"]}>
            <span className={styles["usage-legend-label"]}>
              <span
                className={[
                  styles["usage-legend-swatch"],
                  styles["usage-bar-segment-device"],
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              Other apps
            </span>
            <span className={styles["usage-legend-value"]}>
              {snapshot ? formatBytes(snapshot.deviceUsedByOthersBytes) : "…"}
            </span>
          </div>
        </div>
        {snapshotError ? (
          <p className={styles["usage-error"]}>{snapshotError}</p>
        ) : null}
        <div className={styles["usage-refresh-row"]}>
          <Button
            size="sm"
            variant="ghost"
            disabled={snapshotLoading}
            onClick={() => void fetchSnapshot()}
            className={styles["usage-refresh-button"]}
          >
            {snapshotLoading ? "Calculating…" : "Refresh Usage"}
          </Button>
        </div>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Storage Limits</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Enforce a Storage Limit</Settings.ItemTitle>
              <Settings.ItemDescription>
                Apply an action when the library crosses your cap.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={storagePrefs.guardsEnabled}
                onCheckedChange={(v) =>
                  applyStoragePrefsPatch({ guardsEnabled: v })
                }
              />
            </Settings.ItemControl>
          </Settings.Item>

          {storagePrefs.guardsEnabled ? (
            <>
              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>No Hard Cap</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Pond never blocks new saves. Only the warn threshold fires.
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Switch.Root
                    checked={storagePrefs.maxLibraryGb === null}
                    onCheckedChange={(v) =>
                      applyStoragePrefsPatch({
                        maxLibraryGb: v
                          ? null
                          : (storagePrefs.maxLibraryGb ?? 50),
                      })
                    }
                  />
                </Settings.ItemControl>
              </Settings.Item>

              {storagePrefs.maxLibraryGb !== null ? (
                <Settings.Item>
                  <Settings.ItemDetails>
                    <Settings.ItemTitle>Max Library Size</Settings.ItemTitle>
                    <Settings.ItemDescription>
                      The action fires once usage hits this many GB.
                    </Settings.ItemDescription>
                  </Settings.ItemDetails>
                  <Settings.ItemControl>
                    <InlineRow>
                      <Input
                        data-size="sm"
                        type="number"
                        min={1}
                        max={1000}
                        value={String(storagePrefs.maxLibraryGb ?? 50)}
                        onChange={(e) =>
                          applyStoragePrefsPatch({
                            maxLibraryGb: clamp(
                              Number(e.target.value) || 50,
                              1,
                              1000,
                            ),
                          })
                        }
                        style={{ width: 96 }}
                      />
                      <span className={styles["usage-stat-label"]}>GB</span>
                    </InlineRow>
                  </Settings.ItemControl>
                </Settings.Item>
              ) : null}

              {storagePrefs.maxLibraryGb !== null ? (
                <Settings.Item>
                  <Settings.ItemDetails>
                    <Settings.ItemTitle>Warn At</Settings.ItemTitle>
                    <Settings.ItemDescription>
                      Warn once usage crosses this percentage of the cap.
                    </Settings.ItemDescription>
                  </Settings.ItemDetails>
                  <Settings.ItemControl>
                    <InlineRow>
                      <Input
                        data-size="sm"
                        type="number"
                        min={50}
                        max={100}
                        value={String(storagePrefs.warnAtPercent)}
                        onChange={(e) =>
                          applyStoragePrefsPatch({
                            warnAtPercent: clamp(
                              Number(e.target.value) || 80,
                              50,
                              100,
                            ),
                          })
                        }
                        style={{ width: 96 }}
                      />
                      <span className={styles["usage-stat-label"]}>%</span>
                    </InlineRow>
                  </Settings.ItemControl>
                </Settings.Item>
              ) : null}

              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Action When Exceeded</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {ACTION_LABELS[storagePrefs.action].description}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <Select.Root
                    value={storagePrefs.action}
                    onValueChange={(v) =>
                      applyStoragePrefsPatch({
                        action: v as "warn" | "pauseSync" | "pauseVideo",
                      })
                    }
                  >
                    <Select.Trigger>
                      <Select.Value>
                        {ACTION_LABELS[storagePrefs.action].label}
                      </Select.Value>
                      <Select.Icon>
                        <IconChevronExpandYOutline12 />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner sideOffset={6}>
                        <Select.Popup>
                          <Select.Item value="warn">
                            {ACTION_LABELS.warn.label}
                          </Select.Item>
                          <Select.Item value="pauseSync">
                            {ACTION_LABELS.pauseSync.label}
                          </Select.Item>
                          <Select.Item value="pauseVideo">
                            {ACTION_LABELS.pauseVideo.label}
                          </Select.Item>
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>
                </Settings.ItemControl>
              </Settings.Item>

              <Settings.Item>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>Watch Interval</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {"How often Pond recomputes usage. 1 to 60\u00A0minutes."}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
                  <InlineRow>
                    <Input
                      data-size="sm"
                      type="number"
                      min={1}
                      max={60}
                      value={String(storagePrefs.watchIntervalMinutes)}
                      onChange={(e) =>
                        applyStoragePrefsPatch({
                          watchIntervalMinutes: clamp(
                            Number(e.target.value) || 5,
                            1,
                            60,
                          ),
                        })
                      }
                      style={{ width: 96 }}
                    />
                    <span className={styles["usage-stat-label"]}>min</span>
                  </InlineRow>
                </Settings.ItemControl>
              </Settings.Item>
            </>
          ) : null}
        </Settings.List>
        <GuardStatusRow
          status={guardStatus}
          enabled={storagePrefs.guardsEnabled}
        />
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Library Identity</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Display Name</Settings.ItemTitle>
              <Settings.ItemDescription>
                Cosmetic label shown in chrome and exports.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input
                data-size="sm"
                placeholder="My Pond"
                value={libraryPrefs.displayName}
                onChange={(e) => patchLibrary({ displayName: e.target.value })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Library Location</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Source of Truth</Settings.ItemTitle>
              <Settings.ItemDescription>
                <code>
                  {settings?.libraryRoot ?? "~/Pond/My Pond.library/"}
                </code>
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <InlineRow>
                <Button size="sm" onClick={() => void openInFinder()}>
                  Open in Finder
                </Button>
                <Button
                  size="sm"
                  disabled={busy === "rescan"}
                  onClick={() => void rescan()}
                >
                  Rescan Library
                </Button>
                <Button
                  size="sm"
                  disabled={busy === "move"}
                  onClick={() => void move()}
                >
                  Move Library…
                </Button>
              </InlineRow>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <MetadataSection />

      <Settings.Section>
        <Settings.SectionTitle>Integrity</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Verify Integrity</Settings.ItemTitle>
              <Settings.ItemDescription>
                {report
                  ? `Last run: ${report.totalIndexed} indexed, ${report.totalOnDisk} on disk · ${report.orphans.length} orphan, ${report.missing.length} missing`
                  : "Compare metadata.json files against the SQLite index."}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                disabled={busy === "verify"}
                onClick={() => void verify()}
              >
                {busy === "verify" ? "Checking…" : "Run Check"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}

function MetadataSection() {
  const toast = useToast();
  const [refreshStatus, setRefreshStatus] =
    useState<RefreshBackfillStatusWire>(IDLE_REFRESH);

  useEffect(() => {
    let cancelled = false;
    void window.pond.refreshBackfillStatus().then((s) => {
      if (!cancelled) setRefreshStatus(s);
    });
    const off = window.pond.onRefreshBackfillStatus((s) => {
      setRefreshStatus(s);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const refreshRunning = refreshStatus.state === "running";
  const refreshPct = useMemo(() => {
    if (refreshStatus.total === 0) return 0;
    return Math.min(
      100,
      Math.round((refreshStatus.current / refreshStatus.total) * 100),
    );
  }, [refreshStatus.total, refreshStatus.current]);

  async function startGlobalRefresh() {
    const res = await window.pond.refreshBackfillStart({ source: null });
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
        description: "Your library is empty.",
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

  async function cancelGlobalRefresh() {
    await window.pond.refreshBackfillCancel();
  }

  return (
    <Settings.Section>
      <Settings.SectionTitle>Metadata</Settings.SectionTitle>
      <Settings.List>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Refresh Every Source</Settings.ItemTitle>
            <Settings.ItemDescription>
              {refreshStatus.state === "running"
                ? (refreshStatus.message ?? "Working\u2026")
                : refreshStatus.state === "done"
                  ? (refreshStatus.message ?? "Done.")
                  : refreshStatus.state === "cancelled"
                    ? (refreshStatus.message ?? "Cancelled.")
                    : refreshStatus.state === "error"
                      ? (refreshStatus.message ?? "Error.")
                      : "Re-run OG, hidden-window, and yt-dlp on every save."}
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <InlineRow>
              {refreshRunning ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void cancelGlobalRefresh()}
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={refreshRunning}
                onClick={() => void startGlobalRefresh()}
              >
                {refreshRunning
                  ? `${refreshStatus.current}/${refreshStatus.total}`
                  : "Refresh Metadata"}
              </Button>
            </InlineRow>
          </Settings.ItemControl>
        </Settings.Item>

        {refreshStatus.total > 0 ? (
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Progress</Settings.ItemTitle>
              <Settings.ItemDescription>
                {`${refreshStatus.succeeded} updated · ${refreshStatus.failed} failed${
                  refreshStatus.authRequired.length > 0
                    ? ` · sign-in needed: ${refreshStatus.authRequired
                        .map((s) => getSourceLabel(s))
                        .join(", ")}`
                    : ""
                }`}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <span
                aria-live="polite"
                style={{ minWidth: 56, textAlign: "right" }}
              >
                {refreshPct}%
              </span>
            </Settings.ItemControl>
          </Settings.Item>
        ) : null}
      </Settings.List>
    </Settings.Section>
  );
}

function GuardStatusRow({
  status,
  enabled,
}: {
  status: StorageGuardStatusWire | null;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <div className={styles["status-row"]}>
        <span className={styles["status-dot"]} aria-hidden />
        <span>Guards are off. Pond won't block new saves.</span>
      </div>
    );
  }
  if (!status) {
    return (
      <div className={styles["status-row"]}>
        <span className={styles["status-dot"]} aria-hidden />
        <span>Waiting for the next check…</span>
      </div>
    );
  }

  if (status.state === "ok") {
    return (
      <div className={styles["status-row"]}>
        <span
          className={[styles["status-dot"], styles["status-dot-ok"]]
            .filter(Boolean)
            .join(" ")}
          aria-hidden
        />
        <span>All clear. Using {formatBytes(status.pondBytes)}.</span>
      </div>
    );
  }

  if (status.state === "warn") {
    const pct = pctOfCap(status);
    return (
      <div className={styles["status-row"]}>
        <span
          className={[styles["status-dot"], styles["status-dot-warn"]]
            .filter(Boolean)
            .join(" ")}
          aria-hidden
        />
        <span>
          Approaching limit. Using {formatBytes(status.pondBytes)}
          {pct !== null ? ` (${pct}% of cap)` : ""}.
        </span>
      </div>
    );
  }

  return (
    <div className={styles["status-row"]}>
      <span
        className={[styles["status-dot"], styles["status-dot-error"]]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      />
      <span>Limit exceeded. {ACTION_LABELS[status.action].description}</span>
    </div>
  );
}

function pctOfCap(status: StorageGuardStatusWire): number | null {
  if (!status.capBytes || status.capBytes <= 0) return null;
  return Math.min(100, Math.round((status.pondBytes / status.capBytes) * 100));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0\u00A0B";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (n >= TB) return `${(n / TB).toFixed(2)}\u00A0TB`;
  if (n >= GB) return `${(n / GB).toFixed(2)}\u00A0GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)}\u00A0MB`;
  if (n >= KB) return `${(n / KB).toFixed(1)}\u00A0KB`;
  return `${n}\u00A0B`;
}
