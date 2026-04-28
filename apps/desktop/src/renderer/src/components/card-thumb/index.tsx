import { useSmoothCorners } from "@lisse/react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { requestVideoHeal } from "../../pool/heal";
import { type MediaUnit, pickPrimaryUnit } from "../../pool/media";
import type { Save } from "../../pool/types";
import styles from "./styles.module.css";

/**
 * Thumbnail renderer for the library grid. Cards can contain either:
 *  - An image → plain `<img>`.
 *  - A video (Cosmos, TikTok, YouTube, Twitter clip) → `<video>` that
 *    paints the first frame at rest and plays-on-hover (muted, looped).
 *    When the save also has a poster JPG sibling (yt-dlp downloaded the
 *    MP4, harvester captured the still), we pass it as `poster=` so the
 *    card paints something instantly while the video bytes load.
 *  - Neither → a small placeholder so the grid stays aligned.
 *
 * Pairing logic lives in `pool/media.ts` so the carousel + lightbox
 * make the same decisions as the grid (a video and its poster always
 * collapse into one logical slide, never two).
 *
 * Squircle handling: we use Lisse's `useSmoothCorners` hook (rather
 * than `<SmoothCorners>`) so we control the wrapper element ourselves.
 * The component variant injects an unstyled wrapper `<div>` for the
 * SVG overlay, which breaks the parent flex slot's 138px constraint
 * and lets images grow past the column. With the hook approach we
 * pass our own `wrapperRef` (`.thumb`, width:100% height:100%) and
 * the layout stays predictable.
 */
export function CardThumb({ save }: { save: Save }) {
  const unit = pickPrimaryUnit(save) ?? buildLegacyUnit(save);
  const [broken, setBroken] = useState(false);

  // Reset the broken flag whenever the picked URL changes — without
  // this, a card that 404'd before a Refresh would keep showing the
  // placeholder gradient even after the heal logic wrote real bytes
  // and the cache-buster invalidated the URL. We use React's
  // "store-previous-prop-in-state" pattern (render-phase setState)
  // instead of useEffect so the new <img> mounts in the same commit
  // that swaps the URL — no flash of placeholder between paints.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const pickedSrc = unit?.url ?? null;
  const [lastSrc, setLastSrc] = useState(pickedSrc);
  if (pickedSrc !== lastSrc) {
    setLastSrc(pickedSrc);
    setBroken(false);
  }

  // Single hook call drives clip-path + the SVG overlay (drop shadow +
  // inner border). The element ref points at whichever child we end up
  // rendering — img / video / placeholder div all accept HTMLElement.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLElement>(null);
  useSmoothCorners(elRef, SQUIRCLE, {
    wrapperRef,
    effects: { shadow: DROP_SHADOW, innerBorder: INNER_BORDER },
  });

  // Fall back to the placeholder gradient when the protocol handler
  // returns a 404 — that happens when the DB references files whose
  // bytes vanished from disk (interrupted refresh, hand-edited library
  // dir, etc). The card stays the right *shape* in the grid so the
  // masonry layout doesn't reflow, and the right-pane Refresh button
  // can still trigger the heal logic in `ingest.ts → refreshExisting`.
  const showPlaceholder = !unit || broken;

  return (
    <div ref={wrapperRef} className={styles.thumb}>
      {showPlaceholder ? (
        <div
          ref={elRef as React.RefObject<HTMLDivElement>}
          className={styles.placeholder}
          aria-hidden
        />
      ) : unit.isVideo ? (
        <HoverVideo
          ref={elRef as React.RefObject<HTMLVideoElement>}
          src={unit.url}
          posterUrl={unit.posterUrl}
          label={save.title ?? "video"}
          onBroken={() => {
            setBroken(true);
            // Most likely cause of an `<video>` error here is an old
            // AV1/HEVC download that Electron's bundled ffmpeg can't
            // decode. Ask main to re-run yt-dlp with the new
            // H.264-only selector; once the bytes land the pool
            // reconciler will swap in a fresh sha-bumped URL and the
            // card heals on the next commit.
            requestVideoHeal(save.id);
          }}
        />
      ) : (
        <img
          ref={elRef as React.RefObject<HTMLImageElement>}
          src={unit.url}
          alt=""
          loading="lazy"
          className={styles.media}
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

/**
 * Squircle config tuned to match the Figma `Media` token. Smoothing
 * 0.6 is what Figma's design panel uses by default — it's the most
 * "Apple"-feeling value without distorting the corner curve.
 */
const SQUIRCLE = { radius: 8, smoothing: 0.6 } as const;

/**
 * Mirrors `--pond-card-shadow` but as an SVG-friendly `ShadowConfig`.
 * The original CSS shadow had a "0 0 0 1px" pixel ring which Lisse
 * can't render via box-shadow; we rebuild it with a separate inner
 * border below.
 */
const DROP_SHADOW = {
  offsetX: 0,
  offsetY: 2,
  blur: 2,
  spread: -1,
  color: "#000000",
  opacity: 0.06,
} as const;

const INNER_BORDER = {
  width: 1,
  color: "#000000",
  opacity: 0.08,
} as const;

/**
 * Video that plays muted+looped while the cursor is over it.
 *
 * We keep the `<video>` element mounted at all times so the first frame
 * (or the explicit `poster` image) stays rendered between hovers —
 * toggling the `src` would flash a blank background. `play()` can
 * reject (autoplay policies, a pending load); we swallow those because
 * the fallback is just "no playback", which degrades to the static
 * poster behaviour we already had.
 *
 * Forwards its ref so the parent's `useSmoothCorners` call can target
 * the underlying `<video>` element.
 */
const HoverVideo = forwardRef<
  HTMLVideoElement,
  {
    src: string;
    posterUrl?: string;
    label: string;
    onBroken: () => void;
  }
>(function HoverVideo({ src, posterUrl, label, onBroken }, externalRef) {
  const internalRef = useRef<HTMLVideoElement | null>(null);

  // Bridge the parent's smooth-corners ref *and* keep an internal
  // handle for play/pause. `useImperativeHandle` writes the actual
  // video element into the forwarded ref each render so Lisse always
  // sees a current target.
  useImperativeHandle(
    externalRef,
    () => internalRef.current as HTMLVideoElement,
  );

  const onEnter = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    const promise = el.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        // Autoplay was blocked (rare with `muted`), or the element
        // unmounted mid-load. Nothing to recover from — the static
        // first frame is still visible.
      });
    }
  }, []);

  const onLeave = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      // Seek can throw if metadata hasn't loaded yet; safe to ignore
      // since the element will paint frame 0 on next load anyway.
    }
  }, []);

  return (
    <video
      ref={internalRef}
      src={src}
      poster={posterUrl}
      muted
      loop
      playsInline
      preload="metadata"
      className={styles.media}
      aria-label={label}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onError={onBroken}
    >
      <track kind="captions" />
    </video>
  );
});

/**
 * Save rows that pre-date the local-files era can still surface a
 * cover via the legacy `blobUrl` / `mediaUrl` columns. We synthesise a
 * MediaUnit on the fly so the rest of the component doesn't need to
 * branch — `pickPrimaryUnit` only sees `save.files`, so this fallback
 * fires for the (shrinking) set of rows where files[] is empty.
 */
function buildLegacyUnit(save: Save): MediaUnit | null {
  if (save.blobUrl) {
    return {
      key: "blobUrl",
      url: save.blobUrl,
      isVideo: save.mediaType === "video",
    };
  }
  if (save.mediaUrl) {
    return {
      key: "mediaUrl",
      url: save.mediaUrl,
      isVideo:
        save.mediaType === "video" ||
        /\.(mp4|webm|mov)(\?|$)/i.test(save.mediaUrl),
    };
  }
  return null;
}
