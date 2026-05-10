import { Button, Tooltip, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Save } from "@/pool/types";
import {
  type AuthWalledSource,
  classifyAuthWalled,
  humaniseRefreshReason,
} from "./helpers";
import styles from "./styles.module.css";

export function RefreshAction({ save }: { save: Save }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState<"idle" | "refreshing">("idle");
  const [connecting, setConnecting] = useState(false);

  const auth = useMemo(() => classifyAuthWalled(save), [save]);
  const [connected, reprobeStatus] = useSourceStatus(auth?.source ?? null);

  const connect = useCallback(async () => {
    if (!auth) return;
    setConnecting(true);
    try {
      const res = await window.pond.connectSource(auth.source);
      if (res.ok) {
        toast.add({
          title: `Connected to ${auth.label}`,
          description: "Background refresh is now enabled for this source.",
          type: "success",
        });
      } else {
        toast.add({
          title: `Couldn't connect ${auth.label}`,
          description: "Try again or open settings to retry the sign-in.",
          type: "error",
        });
      }
    } catch (err) {
      console.error("[pond] connectSource threw", err);
      toast.add({
        title: `Couldn't connect ${auth.label}`,
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setConnecting(false);
      reprobeStatus();
    }
  }, [auth, toast, reprobeStatus]);

  const refresh = async () => {
    if (!save.url) return;
    setStatus("refreshing");
    try {
      const res = await window.pond.refreshSave(save.id);
      if (res.ok) {
        toast.add({
          title: "Metadata refreshed",
          description:
            res.method === "og"
              ? "Pulled fresh OpenGraph data from the source."
              : "Re-scraped via signed-in session.",
          type: "success",
        });
        return;
      }
      if (res.reason === "auth_required" && res.source) {
        const source = res.source;
        toast.add({
          title: `Sign in to ${source} to refresh`,
          description:
            "Pond needs a signed-in session to scrape this URL. " +
            "Use the Sign in button below — no need to leave the pane.",
          type: "info",
        });
        reprobeStatus();
        return;
      }
      if (res.reason === "no_metadata") {
        toast.add({
          title: "No richer metadata found",
          description:
            "The source page didn't expose anything new. Existing fields are unchanged.",
          type: "info",
        });
        return;
      }
      toast.add({
        title: "Refresh failed",
        description: humaniseRefreshReason(res.reason),
        type: "error",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[pond] refreshSave threw", err);
      toast.add({
        title: "Refresh failed",
        description: detail.includes("No handler registered")
          ? "Desktop process is out of date — restart the app (Cmd+Q then reopen)."
          : detail.includes("is not a function")
            ? "Preload script is out of date — fully restart the dev server."
            : `Desktop process error: ${detail}`,
        type: "error",
      });
    } finally {
      setStatus("idle");
    }
  };

  const openInBrowser = async () => {
    if (!save.url) return;
    try {
      await window.pond.openExternal(save.url);
    } catch {
      /* surfacing this would just duplicate the toast above */
    }
  };

  const showAuthRow = auth !== null;
  const showSignIn = showAuthRow && connected === false;
  const showConnected = showAuthRow && connected === true;

  return (
    <div className={styles.actions}>
      <div className={styles["actions-row"]}>
        <Button
          size="sm"
          onClick={refresh}
          disabled={!save.url || status === "refreshing"}
        >
          {status === "refreshing" ? "Refreshing…" : "Refresh metadata"}
        </Button>
        <Tooltip.Root content="Open the source URL in your default browser.">
          <span>
            <Button
              size="sm"
              variant="ghost"
              onClick={openInBrowser}
              disabled={!save.url}
            >
              Open original
            </Button>
          </span>
        </Tooltip.Root>
      </div>

      {showSignIn ? (
        <div className={styles["auth-row"]}>
          <span className={styles["auth-status"]} data-state="disconnected">
            <span className={styles["auth-dot"]} aria-hidden="true" />
            Sign in to {auth.label} to enable background refresh
          </span>
          <Button size="sm" onClick={connect} disabled={connecting}>
            {connecting ? "Opening…" : `Sign in to ${auth.label}`}
          </Button>
          <Tooltip.Root content="Manage all connected sources from the settings page.">
            <span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  navigate(`/settings/integrations/${auth.source}`)
                }
              >
                Settings
              </Button>
            </span>
          </Tooltip.Root>
        </div>
      ) : null}

      {showConnected ? (
        <div className={styles["auth-row"]}>
          <span className={styles["auth-status"]} data-state="connected">
            <span className={styles["auth-dot"]} aria-hidden="true" />
            Background refresh ready ({auth.label} session active)
          </span>
        </div>
      ) : null}

      <p className={styles.hint}>
        Pond reads OpenGraph tags directly for public URLs. For X, Instagram,
        Cosmos and TikTok it scrapes via your signed-in session.
      </p>
    </div>
  );
}

function useSourceStatus(
  source: AuthWalledSource | null,
): [boolean | null, () => void] {
  const [connected, setConnected] = useState<boolean | null>(null);

  const probe = useCallback(() => {
    if (!source) {
      setConnected(null);
      return () => {};
    }
    let cancelled = false;
    void window.pond
      .sourceStatus(source)
      .then((res) => {
        if (cancelled) return;
        setConnected(res.ok ? res.connected : false);
      })
      .catch(() => {
        if (cancelled) return;
        setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => probe(), [probe]);

  const reprobe = useCallback(() => {
    probe();
  }, [probe]);

  return [connected, reprobe];
}
