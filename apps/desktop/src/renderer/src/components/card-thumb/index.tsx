import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsVideoDownloading } from "../../pool/downloads";
import { requestVideoHeal } from "../../pool/heal";
import { type MediaUnit, pickPrimaryUnit } from "../../pool/media";
import type { Save } from "../../pool/types";
import styles from "./styles.module.css";

/**
 * Compound `Card` for the library grid thumbnail.
 *
 * `Card.Root` is the provider — it picks the primary `MediaUnit` for
 * the save, subscribes to the auto-video download queue, and tracks
 * the broken/healed state of the cover. Subcomponents read all of
 * that from context (`use(CardContext)`) so consumers compose only
 * the pieces they want without prop-drilling.
 *
 * Common composition:
 *
 *   <Card.Root save={save}>
 *     <Card.Media />               // image | video | placeholder
 *     <Card.DownloadingBadge />    // top-right pill while yt-dlp runs
 *   </Card.Root>
 *
 * Fine-grained composition (each subcomponent self-gates on context):
 *
 *   <Card.Root save={save}>
 *     <Card.Image />
 *     <Card.Video />
 *     <CustomPlaceholder />        // swap in your own
 *     <Card.DownloadingBadge />
 *   </Card.Root>
 *
 * Pairing logic for video + poster lives in `pool/media.ts` so the
 * carousel + lightbox make the same decisions as the grid (a video
 * and its poster always collapse into one logical slide, never two).
 *
 * Corners + chrome (drop shadow + inner border) are pure CSS — see
 * `.thumb` in `styles.module.css`. The two ambient bits the CSS needs
 * — the active grid layout mode and the card's selection state — are
 * passed in as `layout` + `selection` props on `<Card.Root>` and
 * surfaced as `data-layout` / `data-selection` attributes on the
 * `.thumb` wrapper, so the CSS module can self-target without ever
 * reaching for `:global` to read ancestor classes set by another file.
 */

/** Active grid layout mode — drives aspect ratio + chrome. */
type CardLayout = "waterfall" | "grid" | "justified";

/** Selection state — drives the `::after` halo (dashed-blue or dotted-gray). */
type CardSelection = "primary" | "multi";

interface CardState {
  save: Save;
  unit: MediaUnit | null;
  isBroken: boolean;
  isDownloading: boolean;
}

interface CardActions {
  setBroken: (broken: boolean) => void;
  healVideo: () => void;
}

interface CardContextValue {
  state: CardState;
  actions: CardActions;
}

const CardContext = createContext<CardContextValue | null>(null);

function useCardContext(): CardContextValue {
  const ctx = use(CardContext);
  if (!ctx) {
    throw new Error("Card.* components must be rendered inside <Card.Root>");
  }
  return ctx;
}

function CardRoot({
  save,
  layout,
  selection,
  children,
}: {
  save: Save;
  /** Omit when the card isn't inside a grid layout (inbox, related-rail). */
  layout?: CardLayout;
  /** Omit when the card isn't selectable. */
  selection?: CardSelection;
  children: ReactNode;
}) {
  const unit = pickPrimaryUnit(save) ?? buildLegacyUnit(save);
  const isDownloading = useIsVideoDownloading(save.id);
  const [broken, setBroken] = useState(false);

  // Reset the broken flag whenever the picked URL changes — without
  // this, a card that 404'd before a Refresh would keep showing the
  // placeholder gradient even after the heal logic wrote real bytes
  // and the cache-buster invalidated the URL. Render-phase setState
  // (React's "store-previous-prop-in-state" pattern) instead of
  // useEffect so the new <img> mounts in the same commit that swaps
  // the URL — no flash of placeholder between paints.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const pickedSrc = unit?.url ?? null;
  const [lastSrc, setLastSrc] = useState(pickedSrc);
  if (pickedSrc !== lastSrc) {
    setLastSrc(pickedSrc);
    setBroken(false);
  }

  const value = useMemo<CardContextValue>(
    () => ({
      state: { save, unit, isBroken: broken, isDownloading },
      actions: {
        setBroken,
        // Most likely cause of an `<video>` error is an old AV1/HEVC
        // download that Electron's bundled ffmpeg can't decode. Ask
        // main to re-run yt-dlp with the new H.264-only selector;
        // once the bytes land the pool reconciler will swap in a
        // fresh sha-bumped URL and the card heals on the next commit.
        healVideo: () => requestVideoHeal(save.id),
      },
    }),
    [save, unit, broken, isDownloading],
  );

  return (
    <CardContext value={value}>
      <div
        className={styles.thumb}
        data-layout={layout}
        data-selection={selection}
      >
        {children}
      </div>
    </CardContext>
  );
}

function CardImage() {
  const { state, actions } = useCardContext();
  if (!state.unit || state.unit.isVideo || state.isBroken) return null;
  return (
    <img
      src={state.unit.url}
      alt=""
      loading="lazy"
      className={styles.media}
      onError={() => actions.setBroken(true)}
    />
  );
}

function CardVideo() {
  const { state, actions } = useCardContext();
  if (!state.unit?.isVideo || state.isBroken) return null;
  return (
    <HoverVideo
      src={state.unit.url}
      posterUrl={state.unit.posterUrl}
      label={state.save.title ?? "video"}
      onBroken={() => {
        actions.setBroken(true);
        actions.healVideo();
      }}
    />
  );
}

/**
 * Fall back to the placeholder gradient when the protocol handler
 * returns a 404 — that happens when the DB references files whose
 * bytes vanished from disk (interrupted refresh, hand-edited library
 * dir, etc). The card stays the right *shape* in the grid so the
 * masonry layout doesn't reflow, and the right-pane Refresh button
 * can still trigger the heal logic in `ingest.ts → refreshExisting`.
 */
function CardPlaceholder() {
  const { state } = useCardContext();
  if (state.unit && !state.isBroken) return null;
  return <div className={styles.placeholder} aria-hidden />;
}

/** Sugar for `<CardImage /> + <CardVideo /> + <CardPlaceholder />`. */
function CardMedia() {
  return (
    <>
      <CardImage />
      <CardVideo />
      <CardPlaceholder />
    </>
  );
}

function CardDownloadingBadge() {
  const { state } = useCardContext();
  if (!state.isDownloading) return null;
  return (
    <span
      className={styles.downloading}
      role="status"
      aria-label="Downloading video"
      title="Downloading video…"
    >
      <span className={styles.downloadingDot} aria-hidden="true" />
      Downloading
    </span>
  );
}

/**
 * Video that plays muted+looped while the cursor is over it.
 *
 * The `<video>` element stays mounted at all times so the first frame
 * (or the explicit `poster` image) stays rendered between hovers —
 * toggling the `src` would flash a blank background. `play()` can
 * reject (autoplay policies, a pending load); we swallow those because
 * the fallback is just "no playback", which degrades to the static
 * poster behaviour.
 */
function HoverVideo({
  src,
  posterUrl,
  label,
  onBroken,
}: {
  src: string;
  posterUrl?: string;
  label: string;
  onBroken: () => void;
}) {
  const internalRef = useRef<HTMLVideoElement | null>(null);

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

  // Detect codec-unsupported videos that *don't* fire `onError` —
  // typical with `preload="metadata"` because the decoder isn't set up
  // until play is pressed. Chromium still parses the container (so
  // `loadedmetadata` fires) but `videoWidth` stays at 0 when it can't
  // initialise the decoder. The classic case: AV1 / HEVC saved before
  // we tightened the yt-dlp format selector. See `pool/heal.ts` for
  // dedup; the heal IPC is a no-op when the renderer keeps polling.
  const onLoadedMetadata = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      onBroken();
    }
  }, [onBroken]);

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
      onLoadedMetadata={onLoadedMetadata}
    >
      <track kind="captions" />
    </video>
  );
}

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

export const Card = {
  Root: CardRoot,
  Media: CardMedia,
  Image: CardImage,
  Video: CardVideo,
  Placeholder: CardPlaceholder,
  DownloadingBadge: CardDownloadingBadge,
};

export type {
  CardActions,
  CardContextValue,
  CardLayout,
  CardSelection,
  CardState,
};
export { CardContext, useCardContext };
