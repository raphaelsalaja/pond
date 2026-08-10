import { useCallback, useEffect, useRef, useState } from "react";
import { useImageReady } from "@/components/save/card/media/lib/use-image-ready";
import { recordAspect } from "@/stores/aspect";
import styles from "./styles.module.css";

export function HoverVideo({
  saveId,
  src,
  posterUrl,
  label,
  onBroken,
  onReady,
}: {
  saveId: string;
  src: string;
  posterUrl?: string;
  label: string;
  onBroken: () => void;
  onReady: () => void;
}) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const [primed, setPrimed] = useState(false);
  const [active, setActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const poster = useImageReady(posterUrl ?? null, onReady);

  useEffect(() => {
    if (!active || !primed) return;
    const el = internalRef.current;
    if (!el) return;
    const promise = el.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {});
    }
  }, [active, primed]);

  const onEnter = useCallback(() => {
    setActive(true);
    setPrimed(true);
  }, []);

  const onLeave = useCallback(() => {
    setActive(false);
    const el = internalRef.current;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* Seek can throw if metadata hasn't loaded yet. */
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const el = internalRef.current;
    if (!el) return;
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      onBroken();
      return;
    }
    recordAspect(saveId, el.videoWidth, el.videoHeight);
  }, [onBroken, saveId]);

  return (
    <>
      {posterUrl ? (
        <img
          ref={poster.ref}
          src={posterUrl}
          alt=""
          decoding="async"
          fetchPriority="auto"
          className={styles.poster}
          data-loaded={poster.loaded ? "true" : "false"}
          draggable={false}
          onLoad={poster.onLoad}
          onError={onBroken}
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
        data-active={active ? "true" : undefined}
        data-ready={videoReady ? "true" : undefined}
        aria-label={label}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
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
