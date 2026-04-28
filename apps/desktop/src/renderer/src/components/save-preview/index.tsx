import { useSmoothCorners } from "@lisse/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestVideoHeal } from "../../pool/heal";
import { buildMediaUnits } from "../../pool/media";
import type { Save } from "../../pool/types";
import { Button, Tooltip, useToast } from "../../ui";
import styles from "./styles.module.css";

/**
 * Squircle config for the preview carousel media. We use a slightly
 * larger radius than the grid thumbs (12px vs 8px) because the preview
 * pane media is itself larger — the curve needs more room to read as
 * a smooth squircle rather than a generic rounded corner.
 */
const PREVIEW_SQUIRCLE = { radius: 12, smoothing: 0.6 } as const;
const PREVIEW_SHADOW = {
  offsetX: 0,
  offsetY: 2,
  blur: 2,
  spread: -1,
  color: "#000000",
  opacity: 0.06,
} as const;
const PREVIEW_INNER_BORDER = {
  width: 1,
  color: "#000000",
  opacity: 0.08,
} as const;

/**
 * OS-appropriate label for the "Show in file manager" action. Resolved
 * once at module load — `navigator.platform` is stable for the lifetime
 * of the renderer process.
 */
const REVEAL_LABEL: string = (() => {
  if (typeof navigator === "undefined") return "Reveal in Finder";
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("win")) return "Show in Explorer";
  if (p.includes("linux")) return "Show in File Manager";
  return "Reveal in Finder";
})();

/**
 * Older saves (and some scrapers) duplicate the body into the title
 * field — usually as `text.slice(0, 200)`. When that happens the
 * description below the headline just repeats what's already on screen.
 * We strip the trailing ellipsis added by the in-app refresh harvester
 * before comparing so a "Title…" matched against "Title plus more text"
 * still suppresses the redundant block.
 */
function descriptionMatchesTitle(save: Save): boolean {
  if (!save.title || !save.description) return false;
  const norm = (s: string) =>
    s
      .replace(/[…\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const t = norm(save.title);
  const d = norm(save.description);
  if (!t || !d) return false;
  if (t === d) return true;
  // Description starts with the truncated title → it's the same text.
  if (d.startsWith(t)) return true;
  return false;
}

interface SavePreviewProps {
  save: Save;
  /**
   * Layout density. `pane` (default) is tuned for the right-side
   * preview rail; `page` is the wider, centred layout used by the
   * dedicated `/item/:id` route.
   */
  variant?: "pane" | "page";
}

/**
 * Detail view for a single Save. Used by both the right-side
 * `<PreviewPane>` and the dedicated `/item/:id` route page. Keep the
 * markup identical so the only thing that diverges is the outer
 * container's width / padding.
 */
export function SavePreview({ save, variant = "pane" }: SavePreviewProps) {
  const onTitleBlur = async (e: React.FocusEvent<HTMLHeadingElement>) => {
    const next = e.currentTarget.textContent?.trim() ?? "";
    if (next === (save.title ?? "")) return;
    await window.pond.tx({
      kind: "update",
      model: "save",
      id: save.id,
      patch: { title: next || null },
      before: { title: save.title },
    });
  };

  return (
    <article
      className={`${styles.preview} ${variant === "pane" ? styles.pane : styles.page}`}
    >
      <MediaViewer save={save} />
      <h2
        className={styles.title}
        contentEditable
        suppressContentEditableWarning
        onBlur={onTitleBlur}
      >
        {save.title ?? save.url}
      </h2>
      <p className={styles.meta}>
        <a href={save.url} target="_blank" rel="noreferrer">
          {save.url}
        </a>
        <br />
        {save.source} · {save.author ?? "unknown author"}
      </p>
      {save.description && !descriptionMatchesTitle(save) ? (
        <p className={styles.description}>{save.description}</p>
      ) : null}
      {save.tags.length > 0 ? (
        <div className={styles.tags}>
          {save.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      <FileActions save={save} />
      <RefreshAction save={save} />
    </article>
  );
}

/**
 * Disk-facing affordances: reveal the underlying file in the OS file
 * manager, or hand it to the default app. Both buttons stay disabled
 * for link-only bookmarks (`save.files.length === 0`).
 */
function FileActions({ save }: { save: Save }) {
  const [status, setStatus] = useState<
    "idle" | "revealing" | "opening" | "error"
  >("idle");
  const hasFile = save.files.length > 0;

  const onReveal = async () => {
    if (!hasFile) return;
    setStatus("revealing");
    try {
      const res = await window.pond.revealSave(save.id);
      setStatus(res.ok ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  };

  const onOpen = async () => {
    if (!hasFile) return;
    setStatus("opening");
    try {
      const res = await window.pond.openSaveFile(save.id);
      setStatus(res.ok ? "idle" : "error");
    } catch {
      setStatus("error");
    }
  };

  const revealButton = (
    <Button
      size="sm"
      onClick={onReveal}
      disabled={!hasFile || status !== "idle"}
    >
      {status === "revealing" ? "Opening…" : REVEAL_LABEL}
    </Button>
  );

  return (
    <div className={styles.actions}>
      <div className={styles.actionsRow}>
        {hasFile ? (
          revealButton
        ) : (
          <Tooltip content="This save has no local file yet — nothing to reveal.">
            <span>{revealButton}</span>
          </Tooltip>
        )}
        <Button
          size="sm"
          onClick={onOpen}
          disabled={!hasFile || status !== "idle"}
        >
          {status === "opening" ? "Opening…" : "Open with Default App"}
        </Button>
      </div>
      {status === "error" ? (
        <p className={styles.hint}>Couldn't open — the file may be missing.</p>
      ) : null}
    </div>
  );
}

/**
 * Auth-walled sources whose metadata can only be refreshed through the
 * hidden Chromium window. Mirrors the table in
 * `apps/desktop/src/main/core/refresh/sources.ts` and the
 * `AUTH_WALLED_SOURCES` list in the settings page — keep all three in
 * sync when a new source goes loginful.
 */
const AUTH_WALLED: Record<string, { source: AuthWalledSource; label: string }> =
  {
    "x.com": { source: "twitter", label: "X" },
    "twitter.com": { source: "twitter", label: "X" },
    "instagram.com": { source: "instagram", label: "Instagram" },
    "www.instagram.com": { source: "instagram", label: "Instagram" },
    "cosmos.so": { source: "cosmos", label: "Cosmos" },
    "www.cosmos.so": { source: "cosmos", label: "Cosmos" },
    "tiktok.com": { source: "tiktok", label: "TikTok" },
    "www.tiktok.com": { source: "tiktok", label: "TikTok" },
  };
type AuthWalledSource = "twitter" | "instagram" | "cosmos" | "tiktok";

const SOURCE_LABEL: Record<AuthWalledSource, string> = {
  twitter: "X",
  instagram: "Instagram",
  cosmos: "Cosmos",
  tiktok: "TikTok",
};

/**
 * Classify a save into an auth-walled source if applicable. Prefers
 * the explicit `save.source` enum (correct even when the URL is on a
 * mirror or shortener) and falls back to URL host matching.
 */
function classifyAuthWalled(
  save: Save,
): { source: AuthWalledSource; label: string } | null {
  if (
    save.source === "twitter" ||
    save.source === "instagram" ||
    save.source === "cosmos" ||
    save.source === "tiktok"
  ) {
    return { source: save.source, label: SOURCE_LABEL[save.source] };
  }
  if (!save.url) return null;
  try {
    const host = new URL(save.url).hostname.toLowerCase();
    const tail = host.split(".").slice(-3).join(".");
    return AUTH_WALLED[host] ?? AUTH_WALLED[tail] ?? null;
  } catch {
    return null;
  }
}

/**
 * Probe `window.pond.sourceStatus` for an auth-walled source so the
 * preview pane can show "background refresh ready" vs "sign in to
 * unlock". Returns `[connected, reprobe]` — call `reprobe()` after a
 * `connectSource` round-trip so the CTA flips without the user having
 * to navigate away and back.
 */
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

  // Manual reprobe ignores the cleanup token — we don't strictly need
  // to cancel the pending fetch here because React will only render the
  // latest `setConnected` call anyway, and the request is idempotent.
  const reprobe = useCallback(() => {
    probe();
  }, [probe]);

  return [connected, reprobe];
}

/**
 * In-app metadata refresh. Driven by the new `refreshSave` IPC, which:
 *   1. Tries the cheap server-side OG / oEmbed reader for non-auth-walled URLs.
 *   2. Falls back to a hidden Chromium window with the user's persisted
 *      session for sources like X / Instagram / Cosmos.
 *
 * We surface three end states to the user via the toast bus:
 *   - success: pond merged richer fields (kind: og or hidden-window)
 *   - auth_required: user needs to connect that source — handled inline
 *     via the per-save "Sign in to <source>" CTA below (no settings hop)
 *   - error: anything else (network blocked, no metadata, etc.) — we
 *     still offer the legacy "open in browser" affordance as a fallback.
 *
 * For auth-walled sources the pane probes `sourceStatus` on mount so it
 * can show the inline "Sign in" button proactively, before the user
 * even clicks Refresh.
 */
function RefreshAction({ save }: { save: Save }) {
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
      // Re-probe on resolve so the CTA flips to "Connected" without
      // requiring the user to navigate away and back.
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
        // Inline CTA does the heavy lifting now — toast is informational
        // only and the button is already on screen below.
        toast.add({
          title: `Sign in to ${source} to refresh`,
          description:
            "Pond needs a signed-in session to scrape this URL. " +
            "Use the Sign in button below — no need to leave the pane.",
          type: "info",
        });
        // Re-probe in case the session expired silently — this flips the
        // CTA back to "Sign in" if it was previously "Connected".
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
        description: humanise(res.reason),
        type: "error",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Surface the IPC-level error verbatim so we don't lose the
      // "No handler registered" / "refreshSave is not a function" hints
      // that point at a stale main process or an old preload bundle.
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

  // Status badge for auth-walled saves. Three states:
  //   null      — still probing on mount, render nothing
  //   true      — green dot, "Background refresh ready"
  //   false     — amber dot + inline "Sign in to <Label>" button
  // Non-auth-walled saves get nothing here — refresh is always cheap.
  const showAuthRow = auth !== null;
  const showSignIn = showAuthRow && connected === false;
  const showConnected = showAuthRow && connected === true;

  return (
    <div className={styles.actions}>
      <div className={styles.actionsRow}>
        <Button
          size="sm"
          onClick={refresh}
          disabled={!save.url || status === "refreshing"}
        >
          {status === "refreshing" ? "Refreshing…" : "Refresh metadata"}
        </Button>
        <Tooltip content="Open the source URL in your default browser.">
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
        </Tooltip>
      </div>

      {showSignIn ? (
        <div className={styles.authRow}>
          <span className={styles.authStatus} data-state="disconnected">
            <span className={styles.authDot} aria-hidden="true" />
            Sign in to {auth.label} to enable background refresh
          </span>
          <Button size="sm" onClick={connect} disabled={connecting}>
            {connecting ? "Opening…" : `Sign in to ${auth.label}`}
          </Button>
          <Tooltip content="Manage all connected sources from the settings page.">
            <span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate(`/settings?connect=${auth.source}`)}
              >
                Settings
              </Button>
            </span>
          </Tooltip>
        </div>
      ) : null}

      {showConnected ? (
        <div className={styles.authRow}>
          <span className={styles.authStatus} data-state="connected">
            <span className={styles.authDot} aria-hidden="true" />
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

function humanise(
  reason:
    | "not_found"
    | "no_url"
    | "no_metadata"
    | "auth_required"
    | "blocked"
    | "internal_error",
): string {
  switch (reason) {
    case "not_found":
      return "This save no longer exists in the library.";
    case "no_url":
      return "This save has no source URL to refresh from.";
    case "blocked":
      return "Couldn't reach the source — the host may be offline or blocking us.";
    case "no_metadata":
      return "The source page didn't expose anything new.";
    case "auth_required":
      return "Connect this source to scrape pages that need a sign-in.";
    case "internal_error":
      return "Pond hit an unexpected error. Check the logs.";
  }
}

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
}

function MediaViewer({ save }: { save: Save }) {
  // `buildMediaUnits` already does the cover/video pairing — we just
  // re-shape its output to the field names the carousel expects and
  // tack on the legacy fallbacks for rows whose files[] is empty.
  const allSlides = useMemo<MediaSlide[]>(() => {
    const units = buildMediaUnits(save);
    const out: MediaSlide[] = units.map((u) => ({
      src: u.url,
      isVideo: u.isVideo,
      posterUrl: u.posterUrl,
    }));
    if (out.length === 0 && save.blobUrl) {
      out.push({ src: save.blobUrl, isVideo: save.mediaType === "video" });
    }
    if (out.length === 0 && save.mediaUrl) {
      out.push({ src: save.mediaUrl, isVideo: save.mediaType === "video" });
    }
    return out;
  }, [save]);

  // Live set of `src` values that returned 404 in this mount. We use it
  // to filter the visible carousel so a save whose first 3 files vanished
  // from disk still surfaces the surviving 4 cleanly. Stored separately
  // from `allSlides` so React doesn't churn the memo when a single image
  // errors. Reset implicitly via the `key` on the parent component.
  const [broken, setBroken] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const markBroken = useCallback((src: string) => {
    setBroken((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  const slides = useMemo(
    () => allSlides.filter((s) => !broken.has(s.src)),
    [allSlides, broken],
  );

  const [index, setIndex] = useState(0);
  // Hook-driven squircle: we own the wrapper element so the layout
  // stays predictable. See `card-thumb/index.tsx` for the same pattern
  // (the `<SmoothCorners>` component injects an unstyled wrapper that
  // breaks our flex parents).
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLElement>(null);
  useSmoothCorners(mediaRef, PREVIEW_SQUIRCLE, {
    wrapperRef,
    effects: { shadow: PREVIEW_SHADOW, innerBorder: PREVIEW_INNER_BORDER },
  });
  if (slides.length === 0) return null;
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <div className={styles.carousel}>
      <div ref={wrapperRef} className={styles.mediaShell}>
        {slide.isVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            key={slide.src}
            src={slide.src}
            poster={slide.posterUrl}
            controls
            className={styles.media}
            onError={() => {
              markBroken(slide.src);
              requestVideoHeal(save.id);
            }}
            onLoadedMetadata={(e) => {
              // Codec-unsupported videos (typically pre-codec-fix
              // AV1/HEVC files) don't always fire `onError` — the
              // container parses fine but the decoder can't init, so
              // videoWidth stays at 0. Treat that as broken too so
              // the auto-heal still kicks off.
              const v = e.currentTarget;
              if (v.videoWidth === 0 && v.videoHeight === 0) {
                markBroken(slide.src);
                requestVideoHeal(save.id);
              }
            }}
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            ref={mediaRef as React.RefObject<HTMLImageElement>}
            key={slide.src}
            src={slide.src}
            alt={save.title ?? ""}
            className={styles.media}
            onError={() => markBroken(slide.src)}
          />
        )}
      </div>
      {hasMany ? (
        <>
          <Tooltip content="Previous" side="right">
            <button
              type="button"
              className={`${styles.nav} ${styles.navPrev}`}
              onClick={() =>
                setIndex((i) => (i - 1 + slides.length) % slides.length)
              }
              aria-label="Previous"
            >
              ‹
            </button>
          </Tooltip>
          <Tooltip content="Next" side="left">
            <button
              type="button"
              className={`${styles.nav} ${styles.navNext}`}
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
              aria-label="Next"
            >
              ›
            </button>
          </Tooltip>
          <div className={styles.dots} aria-hidden="true">
            {slides.map((s, i) => (
              <span
                key={s.src}
                className={
                  i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot
                }
              />
            ))}
          </div>
          <div className={styles.counter}>
            {index + 1} / {slides.length}
          </div>
        </>
      ) : null}
    </div>
  );
}
