import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIsVideoDownloading } from "../../pool/downloads";
import { requestVideoHeal } from "../../pool/heal";
import { buildMediaUnits } from "../../pool/media";
import { useSimilarSaves } from "../../pool/search";
import type { Save } from "../../pool/types";
import { Button, Input, Tooltip, useToast } from "../../ui";
import { ActivityList } from "../activity-list";
import { Card } from "../card-thumb";
import { SaveStats } from "../save-stats";
import styles from "./styles.module.css";

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

/**
 * Threshold above which we collapse the description behind a
 * "Show more" toggle. YouTube descriptions in particular run to
 * thousands of characters with full link sections / chapter lists, and
 * the unfurled blob shoves every other section of the preview pane off
 * the bottom of the screen.
 */
const DESCRIPTION_COLLAPSE_THRESHOLD = 480;

/**
 * Linkified, newline-preserving description block. The CSS handles
 * newlines via `white-space: pre-wrap`; here we walk the text and turn
 * any `https://…` runs into clickable `<a target="_blank">` so YouTube /
 * tweet / blog descriptions land with working links instead of an inert
 * wall of plain text.
 *
 * Long descriptions collapse to roughly the first ~480 characters with
 * a Show-more / Show-less toggle. The clamp respects word boundaries
 * (snapping to the previous whitespace) so we never split a URL or
 * mid-word.
 */
function DescriptionBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const tooLong = text.length > DESCRIPTION_COLLAPSE_THRESHOLD;
  const visible = useMemo(() => {
    if (!tooLong || expanded) return text;
    const cut = text.slice(0, DESCRIPTION_COLLAPSE_THRESHOLD);
    // Snap to the previous whitespace so we don't split a URL or word.
    const wsIdx = cut.search(/\s\S*$/);
    return `${wsIdx > 0 ? cut.slice(0, wsIdx) : cut}…`;
  }, [text, tooLong, expanded]);

  return (
    <div className={styles.description}>
      <Linkified text={visible} />
      {tooLong ? (
        <button
          type="button"
          className={styles.descriptionToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * URL matcher tuned for plain-text descriptions. We grab `https?://…`
 * runs up to the next whitespace / closing bracket, then strip a small
 * tail of trailing punctuation that's almost always sentence-ending
 * rather than part of the URL (`,`, `.`, `!`, `?`, `;`, `:`, `'`,
 * `"`, `)`, `]`). This avoids over-matching common cases like
 * `… see https://example.com.` without needing a full URL parser.
 */
const DESCRIPTION_URL_RE = /https?:\/\/[^\s<>()[\]{}]+/g;

function Linkified({ text }: { text: string }): ReactNode {
  const matches = Array.from(text.matchAll(DESCRIPTION_URL_RE));
  if (matches.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    const idx = m.index ?? 0;
    let url = m[0];
    // Strip trailing punctuation that's almost certainly not part of
    // the URL. Keep doing this so `foo.com).` becomes `foo.com` not
    // `foo.com)`.
    while (/[.,!?;:'")\]]$/.test(url)) url = url.slice(0, -1);
    if (!url) continue;
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    // Char offset is unique per URL within `text`; safe to key by it.
    parts.push(
      <a
        key={`url@${idx}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className={styles.descriptionLink}
      >
        {url}
      </a>,
    );
    cursor = idx + url.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  // Fragment so the parent `<div>` keeps its styling without an extra
  // wrapping element changing layout.
  return <Fragment>{parts}</Fragment>;
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
 *
 * The `videoRef` is owned at this level so child components can reach
 * the same `<video>` element — `<MediaViewer>` writes it on mount,
 * `<SaveStats>` reads it for click-to-seek on YouTube chapters.
 */
export function SavePreview({ save, variant = "pane" }: SavePreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
      <MediaViewer save={save} videoRef={videoRef} />
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
        <DescriptionBody text={save.description} />
      ) : null}
      <SaveStats save={save} videoRef={videoRef} />
      <ReaderAction save={save} />
      <VideoTimestamps save={save} />
      <TagEditor save={save} />
      <DominantColorSwatches save={save} />
      <FileActions save={save} />
      <RefreshAction save={save} />
      <RelatedSaves save={save} />
      <ActivitySection save={save} />
    </article>
  );
}

/**
 * Render the AI-extracted dominant cover colours as tap-to-filter
 * swatches. Each swatch deeplinks into the library with a
 * `?color=<hex>` filter so the same hue can be browsed across the
 * entire collection.
 */
function DominantColorSwatches({ save }: { save: Save }) {
  const colors = save.dominantColors ?? [];
  if (colors.length === 0) return null;
  return (
    <div className={styles.swatches}>
      {colors.slice(0, 6).map((c) => (
        <Tooltip key={c.hex} content={`Browse other saves near ${c.hex}`}>
          <Link
            to={`/?color=${encodeURIComponent(c.hex.replace(/^#/, ""))}`}
            className={styles.swatch}
            style={{ background: c.hex }}
            aria-label={`Color ${c.hex}`}
          />
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Vector-knn related items. Renders a compact horizontal rail of the
 * 6 closest neighbours by embedding distance. Hidden until the worker
 * has actually produced an embedding for this save.
 */
function RelatedSaves({ save }: { save: Save }) {
  const related = useSimilarSaves(save.id);
  if (!related || related.length === 0) return null;
  // Always drop the active save out of the recommendations — `saves.similar`
  // already filters it server-side, but we belt-and-brace.
  const items = related.filter((r) => r.id !== save.id).slice(0, 6);
  if (items.length === 0) return null;
  return (
    <div className={styles.actions}>
      <h3 className={styles.timestampsTitle}>Related</h3>
      <div className={styles.relatedRail}>
        {items.map((r) => (
          <Link key={r.id} to={`/?id=${r.id}`} className={styles.relatedTile}>
            <span className={styles.relatedThumb}>
              <Card.Root save={r}>
                <Card.Media />
                <Card.DownloadingBadge />
              </Card.Root>
            </span>
            <span className={styles.relatedLabel}>{r.title ?? r.url}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-item history (sync_actions filtered by save id). Collapsed by
 * default — expanded via a small "Show activity" button so the
 * inspector stays compact for the common case where users don't care.
 */
function ActivitySection({ save }: { save: Save }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.actions}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Hide activity" : "Show activity"}
      </Button>
      {open ? <ActivityList saveId={save.id} limit={50} /> : null}
    </div>
  );
}

/**
 * Render the saved video timestamp notes for a save. Surfaces only
 * when there are existing entries — the *creation* affordance lives on
 * the video element itself in `MediaViewer` below, where we have
 * access to `currentTime`.
 */
function VideoTimestamps({ save }: { save: Save }) {
  const stamps = save.annotations?.videoTimestamps ?? [];
  if (stamps.length === 0) return null;
  return (
    <div className={styles.actions}>
      <h3 className={styles.timestampsTitle}>Timestamps</h3>
      <ul className={styles.timestampsList}>
        {stamps.map((t) => (
          <li key={t.createdAt} className={styles.timestampsItem}>
            <span className={styles.timestampPos}>{formatHms(t.at)}</span>
            <span className={styles.timestampNote}>{t.text ?? ""}</span>
            <button
              type="button"
              className={styles.timestampRemove}
              onClick={async () => {
                const { removeVideoTimestamp } = await import(
                  "../../pool/annotations"
                );
                await removeVideoTimestamp(save, t.at);
              }}
              aria-label="Remove timestamp"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatHms(s: number): string {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Affordance to enter reader mode. Surfaced for any save with cached
 * article HTML, or where the classification / source suggests an article.
 * For classified-but-not-yet-extracted saves the link still works — the
 * reader page itself shows a "Run extraction" CTA.
 */
function ReaderAction({ save }: { save: Save }) {
  const isArticleish =
    save.classification === "article" ||
    save.source === "article" ||
    Boolean(save.articleHtml);
  if (!isArticleish) return null;
  return (
    <div className={styles.actions}>
      <div className={styles.actionsRow}>
        <Tooltip content="Open this article in distraction-free reader mode">
          <Link
            to={`/read/${save.id}`}
            className={styles.readerLink}
            aria-label="Open in reader"
          >
            {save.articleHtml
              ? "Open in reader"
              : "Open in reader (extract on open)"}
          </Link>
        </Tooltip>
        {save.articleReadingMinutes ? (
          <span className={styles.readerMeta}>
            {save.articleReadingMinutes} min read
          </span>
        ) : null}
      </div>
    </div>
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
                onClick={() => navigate(`/settings/sources/${auth.source}`)}
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

function MediaViewer({
  save,
  videoRef,
}: {
  save: Save;
  /**
   * Optional outer ref. When `<MediaViewer>` is rendered inside
   * `<SavePreview>` the parent owns the ref so siblings (like
   * `<SaveStats>`) can target the same `<video>` element. Falls back
   * to a local ref so direct callers (none today, but the export
   * stays self-sufficient) keep working.
   */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const isDownloading = useIsVideoDownloading(save.id);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? localRef;
  const onMarkTimestamp = useCallback(async () => {
    const v = ref.current;
    if (!v) return;
    const at = v.currentTime;
    if (!Number.isFinite(at) || at <= 0) return;
    const text = window.prompt("Note for this moment? (optional)") ?? "";
    const { addVideoTimestamp } = await import("../../pool/annotations");
    await addVideoTimestamp(save, at, text.trim() || undefined);
  }, [save, ref]);
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
  if (slides.length === 0) return null;
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <div className={styles.carousel}>
      <div className={styles.mediaShell}>
        {isDownloading ? (
          <span
            className={styles.downloading}
            role="status"
            aria-label="Downloading video"
            title="Downloading video in the background"
          >
            <span className={styles.downloadingDot} aria-hidden="true" />
            Downloading video…
          </span>
        ) : null}
        {slide.isVideo ? (
          <>
            <video
              ref={ref}
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
                const v = e.currentTarget;
                if (v.videoWidth === 0 && v.videoHeight === 0) {
                  markBroken(slide.src);
                  requestVideoHeal(save.id);
                }
              }}
            >
              <track kind="captions" />
            </video>
            <Tooltip content="Add a note at the current timestamp">
              <Button
                size="sm"
                variant="ghost"
                className={styles.timestampMark}
                onClick={() => void onMarkTimestamp()}
              >
                Mark timestamp
              </Button>
            </Tooltip>
          </>
        ) : (
          <img
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

/**
 * Inline tag editor with autocomplete and chip removal. Reads the
 * current `tags.list` for suggestions, falls back to whatever's
 * already in the in-memory pool. Writes go through `tags.setForSave`
 * which auto-creates canonical rows for new tags.
 */
function TagEditor({ save }: { save: Save }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.pond
      .query("tags.allFromSaves", {})
      .then((rows) => {
        if (cancelled) return;
        const names = (rows as Array<{ name: string }>).map((r) => r.name);
        setAllTags(names);
      })
      .catch(() => {
        if (!cancelled) setAllTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (!needle) return [] as string[];
    const have = new Set(save.tags.map((t) => t.toLowerCase()));
    return allTags
      .filter(
        (t) => !have.has(t.toLowerCase()) && t.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [draft, allTags, save.tags]);

  async function commit(name: string) {
    const cleaned = name
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "")
      .toLowerCase();
    if (!cleaned) return;
    if (save.tags.some((t) => t.toLowerCase() === cleaned)) {
      setDraft("");
      return;
    }
    setBusy(true);
    try {
      await window.pond.query("tags.setForSave", {
        saveId: save.id,
        tags: [...save.tags, cleaned],
      });
      setDraft("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function remove(name: string) {
    setBusy(true);
    try {
      await window.pond.query("tags.setForSave", {
        saveId: save.id,
        tags: save.tags.filter((t) => t.toLowerCase() !== name.toLowerCase()),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.tags} style={{ position: "relative" }}>
      {save.tags.map((tag) => (
        <span key={tag} className={styles.tagWrap}>
          <Link
            to={`/?tag=${encodeURIComponent(tag)}`}
            className={styles.tag}
            title="Filter library by this tag"
          >
            #{tag}
          </Link>
          <button
            type="button"
            className={styles.tagRemove}
            onClick={() => void remove(tag)}
            aria-label={`Remove tag ${tag}`}
            title="Remove tag"
          >
            ×
          </button>
        </span>
      ))}
      {save.aiTags
        .filter(
          (t) => !save.tags.some((s) => s.toLowerCase() === t.toLowerCase()),
        )
        .map((tag) => (
          <button
            key={`ai-${tag}`}
            type="button"
            className={styles.tag}
            style={{ opacity: 0.7, fontStyle: "italic" }}
            onClick={() => void commit(tag)}
            title="AI suggestion — click to accept"
          >
            #{tag}
          </button>
        ))}
      <Input
        ref={inputRef}
        size="sm"
        placeholder="Add tag…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            void commit(draft);
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            save.tags.length > 0
          ) {
            const last = save.tags[save.tags.length - 1];
            if (last) void remove(last);
          } else if (e.key === "Tab" && suggestions[0]) {
            e.preventDefault();
            void commit(suggestions[0]);
          }
        }}
        disabled={busy}
        style={{ flex: 1, minWidth: 80 }}
      />
      {suggestions.length > 0 ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            padding: 4,
            background: "var(--pond-bg)",
            border: "1px solid var(--pond-border-subtle, #2222)",
            borderRadius: 6,
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            zIndex: 10,
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.tag}
              onClick={() => void commit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
