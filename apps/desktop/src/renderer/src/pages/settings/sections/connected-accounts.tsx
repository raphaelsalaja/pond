import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, useToast } from "../../../ui";
import styles from "../styles.module.css";
import { SectionHeader, SectionStack, SettingsCard } from "./_shared";
import {
  AUTH_WALLED_SOURCES,
  type AuthWalledSource,
  PUBLIC_SOURCES,
} from "./_types";

/**
 * Connected accounts overview. Per-source detail pages live at
 * `/settings/sources/<source>`; this page is the index — quick
 * connect/disconnect actions plus a deep-link to each detail.
 *
 * Honours the legacy `?connect=<source>` query param so the
 * "Connect to refresh" toast on a save card can drop the user
 * straight into the right sign-in window.
 */
export function ConnectedAccountsSection() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [statuses, setStatuses] = useState<Record<AuthWalledSource, boolean>>({
    twitter: false,
    instagram: false,
    cosmos: false,
    tiktok: false,
    reddit: false,
  });
  const [pending, setPending] = useState<AuthWalledSource | null>(null);

  const refreshStatuses = useCallback(async () => {
    const next: Record<AuthWalledSource, boolean> = {
      twitter: false,
      instagram: false,
      cosmos: false,
      tiktok: false,
      reddit: false,
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

  // Legacy deep-link from the per-save "Connect to refresh" toast.
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
    <SectionStack>
      <SectionHeader
        title="Connected accounts"
        description="Sign in once and metadata refreshes for X, Instagram, Cosmos, and TikTok run silently in the background."
      />

      <SettingsCard title="Authenticated sources">
        <ul className={styles.sourceList}>
          {AUTH_WALLED_SOURCES.map(({ id, label }) => {
            const isConnected = statuses[id];
            const isPending = pending === id;
            return (
              <li key={id} className={styles.sourceRow}>
                <button
                  type="button"
                  className={styles.sourceMetaButton}
                  onClick={() => navigate(`/settings/sources/${id}`)}
                >
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
                </button>
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
      </SettingsCard>

      <SettingsCard title="Public sources">
        <p className={styles.cardLead}>
          These sources can be scraped without sign-in. Their per-source
          settings page covers refresh cadence and rate-limit handling.
        </p>
        <ul className={styles.sourceList}>
          {PUBLIC_SOURCES.map(({ id, label }) => (
            <li key={id} className={styles.sourceRow}>
              <button
                type="button"
                className={styles.sourceMetaButton}
                onClick={() => navigate(`/settings/sources/${id}`)}
              >
                <span className={styles.sourceName}>{label}</span>
                <span className={styles.statusDisconnected}>
                  No sign-in required
                </span>
              </button>
              <div className={styles.sourceActions}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/settings/sources/${id}`)}
                >
                  Configure
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SectionStack>
  );
}
