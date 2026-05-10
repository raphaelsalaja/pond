import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "@/lib/use-in-view";
import { recordAspect } from "@/pages/saves-view/aspect";
import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function Video() {
  const { state, actions } = useCardContext();
  if (!state.unit?.isVideo || state.isBroken) return null;
  return (
    <HoverVideo
      saveId={state.save.id}
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

function HoverVideo({
  saveId,
  src,
  posterUrl,
  label,
  onBroken,
}: {
  saveId: string;
  src: string;
  posterUrl?: string;
  label: string;
  onBroken: () => void;
}) {
  const internalRef = useRef<HTMLVideoElement | null>(null);

  // Don't kick off metadata fetches for cards that aren't (close to)
  // on screen. A 200-card library typically has 10–30 cards visible
  // at once; without this the browser sets up demuxers for every
  // video card on first paint.
  const inView = useInView(internalRef);
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    if (inView && !primed) setPrimed(true);
  }, [inView, primed]);

  const onEnter = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    const promise = el.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        // Autoplay was blocked (rare with `muted`), or the element
        // unmounted mid-load.
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
      // Seek can throw if metadata hasn't loaded yet; safe to ignore.
    }
  }, []);

  // Detect codec-unsupported videos that *don't* fire `onError` —
  // typical with `preload="metadata"` because the decoder isn't set up
  // until play is pressed. Chromium still parses the container (so
  // `loadedmetadata` fires) but `videoWidth` stays at 0 when it can't
  // initialise the decoder.
  const onLoadedMetadata = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      onBroken();
      return;
    }
    recordAspect(saveId, el.videoWidth, el.videoHeight);
  }, [onBroken, saveId]);

  return (
    <video
      ref={internalRef}
      // `src` is omitted until the card has been near the viewport at
      // least once; the poster paints in the meantime. Once primed we
      // keep `src` set so re-entering the viewport doesn't re-fetch.
      {...(primed ? { src } : {})}
      poster={posterUrl}
      muted
      loop
      playsInline
      preload={primed ? "metadata" : "none"}
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
