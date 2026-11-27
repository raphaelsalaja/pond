import { useCallback, useEffect, useRef, useState } from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import { useImageReady } from "@/features/saves/components/card/media/lib/use-image-ready";
import type { MediaUnit } from "@/features/saves/lib/media/units";
import { thumbUrlFor } from "@/features/saves/lib/media/url";
import { aspectCoverKey, recordAspect } from "@/features/saves/state/aspect";
import { rememberCardThumbnail } from "@/features/saves/state/card-thumbnails";
import { useMachinePlaybackPaused } from "@/shared/lib/use-machine-motion";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

/** Grace after leave so a quick re-hover reuses the decoder instead of refetching. */
const RELEASE_DELAY_MS = 400;
/** A pointer passing over a card on its way elsewhere should not open a decoder. */
const HOVER_DELAY_MS = 450;

function seekToStart(el: HTMLVideoElement) {
  try {
    el.currentTime = 0;
  } catch {
    /** Seeking throws while the media has no seekable range; the poster frame stays. */
  }
}

/** Autoplay rejections are expected, and pausing before playback starts rejects `play()`. */
function ignoreAutoplayRejection(): void {}

/** The poster and video fill the same media well, whose hit target can be either sibling. */
function mediaWellHovered(el: HTMLVideoElement): boolean {
  return el.matches(":hover") || el.parentElement?.matches(":hover") === true;
}

export function HoverVideo({
  saveId,
  src,
  unit,
  posterUrl,
  posterWidth,
  blurhash,
  label,
  onBroken,
  onReady,
  hasVideoDims = false,
  hoverOnly = false,
}: {
  saveId: string;
  src: string;
  unit: MediaUnit;
  posterUrl?: string;
  posterWidth?: number;
  blurhash?: string | null;
  label: string;
  onBroken: () => void;
  onReady?: () => void;
  hasVideoDims?: boolean;
  /** The card already paints its own still, so the video never renders a poster, hash, or resting frame: it appears only while hovered. */
  hoverOnly?: boolean;
}) {
  const [prefs] = usePrefs("viewer");
  const playbackPaused = useMachinePlaybackPaused();
  const hoverEnabled = prefs.hoverVideo !== false;
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const releaseTimer = useRef<number | undefined>(undefined);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [hoverPrimed, setHoverPrimed] = useState(false);
  const [active, setActive] = useState(false);
  const [dragVetoed, setDragVetoed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  const coverKey = aspectCoverKey(unit);
  const effectivePosterUrl =
    hoverOnly || posterBroken
      ? undefined
      : posterUrl && thumbUrlFor(posterUrl, posterWidth);
  const needsRestingVideo = !hoverOnly && !effectivePosterUrl;
  const primed = hoverPrimed || needsRestingVideo;

  const reportPosterReady = useCallback(
    (image: HTMLImageElement) => {
      /** Platform posters can disagree with the stream (YouTube Shorts 16:9 blur composites). */
      if (!hasVideoDims) {
        recordAspect(saveId, image.naturalWidth, image.naturalHeight, {
          coverKey,
        });
      }
      /** A cross-file poster must not become the viewer underlay; cardThumbnails are same-file by contract. */
      if (!unit.posterIsCrossFile) {
        rememberCardThumbnail(src, image.currentSrc || image.src);
      }
      onReady?.();
    },
    [coverKey, hasVideoDims, onReady, saveId, src, unit.posterIsCrossFile],
  );
  const {
    ref: posterRef,
    loaded: posterLoaded,
    onLoad: onPosterLoad,
  } = useImageReady(effectivePosterUrl ?? null, reportPosterReady);

  useEffect(() => {
    if (!active || !primed || !hoverEnabled) return;
    const el = internalRef.current;
    if (!el) {
      return;
    }
    /** Some Chromium builds return undefined from `play()`. */
    const play = (): void => {
      el.play()?.catch(ignoreAutoplayRejection);
    };
    const pause = (): void => {
      el.pause();
    };
    const onVisibility = (): void => {
      if (document.hidden) pause();
      else if (document.hasFocus()) play();
    };
    if (playbackPaused) {
      pause();
      return () => pause();
    }
    if (!document.hidden && document.hasFocus()) play();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", onVisibility);
      pause();
    };
  }, [active, primed, hoverEnabled, playbackPaused]);

  useEffect(() => {
    if (primed) return;
    const el = internalRef.current;
    if (!el || el.networkState === HTMLMediaElement.NETWORK_EMPTY) return;
    /** Dropping src alone keeps the decoder and buffers; load() with no source frees them. */
    el.removeAttribute("src");
    el.load();
    setVideoReady(false);
  }, [primed]);

  useEffect(
    () => () => {
      window.clearTimeout(releaseTimer.current);
      window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  const activate = useCallback(() => {
    if (!hoverEnabled) return;
    if (document.body.dataset.saveDragging) {
      setDragVetoed(true);
      return;
    }
    setDragVetoed(false);
    window.clearTimeout(releaseTimer.current);
    setActive(true);
    setHoverPrimed(true);
  }, [hoverEnabled]);

  const armHover = useCallback(() => {
    if (!hoverEnabled) return;
    window.clearTimeout(releaseTimer.current);
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = undefined;
      activate();
    }, HOVER_DELAY_MS);
  }, [activate, hoverEnabled]);

  /** Chromium does not fire mouseenter for an element inserted under a stationary pointer. */
  useEffect(() => {
    const el = internalRef.current;
    if (!el || hoverTimer.current !== undefined || !mediaWellHovered(el)) {
      return;
    }
    armHover();
  }, [armHover, src, unit.key]);

  useEffect(() => {
    if (!dragVetoed) return;
    const retry = (): void => {
      if (document.body.dataset.saveDragging) return;
      setDragVetoed(false);
      if (active || hoverTimer.current !== undefined) return;
      const el = internalRef.current;
      if (!el || !mediaWellHovered(el)) return;
      armHover();
    };
    retry();
    if (!document.body.dataset.saveDragging) return;
    const observer = new MutationObserver(retry);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-save-dragging"],
    });
    return () => observer.disconnect();
  }, [active, armHover, dragVetoed]);

  /** Enter fires once per hover, so movement re-arms a missed or vetoed activation. */
  const onPointerMove = useCallback(() => {
    if (active || hoverTimer.current !== undefined) return;
    armHover();
  }, [active, armHover]);

  const onLeave = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setActive(false);
    setDragVetoed(false);
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(
      () => setHoverPrimed(false),
      RELEASE_DELAY_MS,
    );
    const el = internalRef.current;
    if (!el) return;
    el.pause();
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      onBroken();
      return;
    }
    recordAspect(saveId, el.videoWidth, el.videoHeight, {
      coverKey,
      soft: Boolean(effectivePosterUrl),
    });
    if (needsRestingVideo) {
      seekToStart(el);
      onReady?.();
      setVideoReady(true);
    }
  }, [
    coverKey,
    effectivePosterUrl,
    needsRestingVideo,
    onBroken,
    onReady,
    saveId,
  ]);

  const showHash =
    !hoverOnly &&
    Boolean(blurhash) &&
    (effectivePosterUrl ? !posterLoaded : !videoReady);

  return (
    <>
      {showHash && blurhash ? <BlurHash hash={blurhash} /> : null}
      {effectivePosterUrl ? (
        <img
          ref={posterRef}
          src={effectivePosterUrl}
          alt=""
          decoding="async"
          fetchPriority="auto"
          className={styles.poster}
          data-fit={prefs.galleryFit}
          data-loaded={!blurhash || posterLoaded ? "true" : "false"}
          draggable={false}
          onLoad={onPosterLoad}
          onError={() => setPosterBroken(true)}
        />
      ) : null}
      <video
        ref={internalRef}
        {...(primed ? { src } : {})}
        muted
        loop
        playsInline
        preload={primed ? "metadata" : "none"}
        className={styles.media}
        draggable={false}
        data-fit={prefs.galleryFit}
        data-active={active ? "true" : undefined}
        data-ready={videoReady ? "true" : undefined}
        data-resting={needsRestingVideo && videoReady ? "true" : undefined}
        aria-label={label}
        onMouseEnter={armHover}
        onMouseMove={onPointerMove}
        onMouseLeave={onLeave}
        onFocus={activate}
        onBlur={onLeave}
        onError={onBroken}
        onLoadedMetadata={onLoadedMetadata}
        onPlaying={() => setVideoReady(true)}
      >
        <track kind="captions" />
      </video>
    </>
  );
}
