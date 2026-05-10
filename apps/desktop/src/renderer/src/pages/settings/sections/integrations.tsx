import {
  IconChevronRightOutline18,
  IconMagnifierOutline18,
} from "@pond/icons/outline";
import { Button, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Settings } from "@/components/settings";
import { getSourceLabel, SourceBadge } from "@/components/source-badge";
import pageStyles from "@/pages/settings/styles.module.css";
import type { RefreshBackfillStatusWire } from "../../../../../preload";
import {
  ALL_SOURCES,
  type AnySource,
  AUTH_WALLED_SOURCES,
  type AuthWalledSource,
  isAuthWalled,
} from "./_types";
import styles from "./integrations.module.css";

/**
 * Integrations index. Linear-style information architecture:
 *
 *   1. A search input that filters the list as you type.
 *   2. An "Enabled" group that surfaces every auth-walled source the
 *      user has signed into — quick re-entry to its detail page.
 *   3. An "All integrations" grid showing every supported source, each
 *      a `<Link>` into `/settings/integrations/:source`.
 *
 * Public sources don't have a sign-in toggle, so they're never listed
 * in the Enabled group — including them there would be misleading.
 */

const SOURCE_DESCRIPTIONS: Record<AnySource, string> = {
  twitter:
    "Save tweets and bookmarks. Refresh runs silently in the background.",
  instagram: "Save posts, reels, and bookmarked stories.",
  cosmos: "Sync clusters and items from your Cosmos library.",
  tiktok: "Save liked and bookmarked TikToks.",
  reddit: "Save posts and saved-list entries.",
  pinterest: "Save Pins and entire boards.",
  arena: "Pull blocks and channels from Are.na.",
  youtube: "Save videos, playlists, and watch-later entries.",
};

interface IntegrationItem {
  id: AnySource;
  label: string;
  description: string;
  authWalled: boolean;
}

const INTEGRATIONS: IntegrationItem[] = ALL_SOURCES.map(({ id }) => ({
  id,
  label: getSourceLabel(id),
  description: SOURCE_DESCRIPTIONS[id],
  authWalled: isAuthWalled(id),
}));

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

export function IntegrationsSection() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState<Record<AuthWalledSource, boolean>>(
    {
      twitter: false,
      instagram: false,
      cosmos: false,
      tiktok: false,
      reddit: false,
    },
  );
  const [statusReady, setStatusReady] = useState(false);
  const [refreshStatus, setRefreshStatus] =
    useState<RefreshBackfillStatusWire>(IDLE_REFRESH);

  const refreshStatuses = useCallback(async () => {
    const entries = await Promise.all(
      AUTH_WALLED_SOURCES.map(async ({ id }) => {
        const r = await window.pond.sourceStatus(id).catch(() => null);
        return [id, r?.ok ? r.connected : false] as const;
      }),
    );
    const next: Record<AuthWalledSource, boolean> = {
      twitter: false,
      instagram: false,
      cosmos: false,
      tiktok: false,
      reddit: false,
    };
    for (const [id, isConnected] of entries) {
      next[id] = isConnected;
    }
    setConnected(next);
    setStatusReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await refreshStatuses();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [refreshStatuses]);

  // Legacy `?connect=<source>` deep-link from the per-save "Connect to
  // refresh" toast. Was wired through the old Connected accounts page;
  // still honoured here so existing links keep popping the right
  // sign-in window.
  const autoConnectFired = useRef(false);
  useEffect(() => {
    const wanted = params.get("connect");
    if (!wanted || autoConnectFired.current) return;
    if (!AUTH_WALLED_SOURCES.some((s) => s.id === wanted)) return;
    autoConnectFired.current = true;
    void (async () => {
      const source = wanted as AuthWalledSource;
      try {
        await window.pond.connectSource(source);
        await refreshStatuses();
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
      }
    })();
    const next = new URLSearchParams(params);
    next.delete("connect");
    setParams(next, { replace: true });
  }, [params, refreshStatuses, setParams, toast]);

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

  const filter = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!filter) return INTEGRATIONS;
    return INTEGRATIONS.filter((i) => i.label.toLowerCase().includes(filter));
  }, [filter]);

  const enabled = statusReady
    ? INTEGRATIONS.filter(
        (i) => i.authWalled && connected[i.id as AuthWalledSource],
      )
    : [];

  const enabledFiltered = filter
    ? enabled.filter((i) => i.label.toLowerCase().includes(filter))
    : enabled;

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Integrations</Settings.Title>
        <Settings.Description>
          Connect the sites you save from. One sign-in keeps refresh silent.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <div className={styles.search}>
          <span className={styles["search-icon"]} aria-hidden>
            <IconMagnifierOutline18 width={14} height={14} />
          </span>
          <input
            type="search"
            className={styles["search-input"]}
            placeholder="Search integrations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Settings.Section>

      {enabledFiltered.length > 0 ? (
        <Settings.Section>
          <Settings.SectionTitle>Enabled</Settings.SectionTitle>
          <Settings.List>
            {enabledFiltered.map((item) => (
              <Settings.Item key={item.id} className={styles["enabled-item"]}>
                <Link
                  to={`/settings/integrations/${item.id}`}
                  className={styles["enabled-link"]}
                >
                  <SourceBadge.Root source={item.id} data-size="md" />
                  <Settings.ItemDetails>
                    <Settings.ItemTitle>{item.label}</Settings.ItemTitle>
                    <Settings.ItemDescription>Enabled</Settings.ItemDescription>
                  </Settings.ItemDetails>
                  <span className={styles["enabled-chevron"]} aria-hidden>
                    <IconChevronRightOutline18 width={14} height={14} />
                  </span>
                </Link>
              </Settings.Item>
            ))}
          </Settings.List>
        </Settings.Section>
      ) : null}

      <Settings.Section>
        <Settings.SectionTitle>All Integrations</Settings.SectionTitle>
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            No integrations match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className={styles.grid}>
            {filtered.map((item) => {
              const isEnabled =
                item.authWalled && connected[item.id as AuthWalledSource];
              return (
                <Link
                  key={item.id}
                  to={`/settings/integrations/${item.id}`}
                  className={styles.card}
                >
                  <div className={styles["card-head"]}>
                    <SourceBadge.Root source={item.id} data-size="md" />
                    <span className={styles["card-title"]}>{item.label}</span>
                    {isEnabled ? (
                      <span className={styles["enabled-pill"]}>Enabled</span>
                    ) : null}
                  </div>
                  <p className={styles["card-description"]}>
                    {item.description}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Refresh Metadata</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Refresh Every Source</Settings.ItemTitle>
              <Settings.ItemDescription>
                {refreshStatus.state === "running"
                  ? (refreshStatus.message ?? "Working…")
                  : refreshStatus.state === "done"
                    ? (refreshStatus.message ?? "Done.")
                    : refreshStatus.state === "cancelled"
                      ? (refreshStatus.message ?? "Cancelled.")
                      : refreshStatus.state === "error"
                        ? (refreshStatus.message ?? "Error.")
                        : "Re-run the OG, hidden-window, and yt-dlp pipeline against every save."}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div className={pageStyles.inlineRow}>
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
              </div>
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
    </Settings.Page>
  );
}
