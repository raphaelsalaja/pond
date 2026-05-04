import XMark from "@pond/icons/outline/xmark";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { requestVideoHeal } from "../../pool/heal";
import { useSave } from "../../pool/hooks";
import { buildMediaUnits } from "../../pool/media";
import type { Save } from "../../pool/types";
import { Button, Dialog, DialogContent, Tooltip } from "../../ui";
import styles from "./styles.module.css";

/**
 * Fullscreen media preview triggered by double-clicking a card.
 *
 * URL contract:
 *   - `?focus=<saveId>` opens the lightbox for that save
 *   - clearing the param closes it
 *
 * Why a separate URL param from the side pane (`?id=`):
 *   - both can be open simultaneously (single-click selects → side pane,
 *     double-click expands → lightbox over the top)
 *   - back/forward steps in/out of the lightbox without losing the
 *     surrounding selection state
 */
export function MediaLightbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const save = useSave(focusId ?? undefined);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const open = focusId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent size="fullscreen">
        {save ? (
          <LightboxBody save={save} onClose={close} />
        ) : (
          <div className={styles.empty}>
            <p>Save not found.</p>
            <Button onClick={close}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Body — media stage + close button. Metadata stays in the side pane;  */
/* this view is laser-focused on "look at the thing big".              */
/* ------------------------------------------------------------------ */

function LightboxBody({ save, onClose }: { save: Save; onClose: () => void }) {
  // `buildMediaUnits` already pairs videos with their poster JPGs and
  // dedupes — see `pool/media.ts`. We just adapt the shape and tack on
  // the legacy fallbacks.
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

  // Drop slides whose `pond://` URL 404s in this session so the user
  // never sees the giant "broken image" icon over the dim canvas. The
  // grid thumbs do the same trick — see `card-thumb/index.tsx`.
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

  // Arrow-key carousel nav while the lightbox is mounted. ESC is owned
  // by Base UI's Dialog (which calls our `onOpenChange(false)` →
  // `close()`), so we don't need to handle it here.
  useEffect(() => {
    if (slides.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + slides.length) % slides.length);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % slides.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{save.title ?? save.url}</p>
        <p className={styles.emptyHint}>No local media to preview.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    );
  }

  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <div className={styles.stage}>
      <div className={styles.toolbar}>
        <span className={styles.titleStrip}>
          {save.title ?? save.url}
          {hasMany ? (
            <span className={styles.counter}>
              {index + 1} / {slides.length}
            </span>
          ) : null}
        </span>
        <Tooltip content="Close (Esc)">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            aria-label="Close preview"
          >
            <XMark width={14} height={14} />
          </Button>
        </Tooltip>
      </div>

      <div className={styles.canvas}>
        <div className={styles.mediaShell}>
          {slide.isVideo ? (
            <video
              key={slide.src}
              src={slide.src}
              poster={slide.posterUrl}
              controls
              autoPlay
              className={styles.media}
              onError={() => {
                markBroken(slide.src);
                requestVideoHeal(save.id);
              }}
              onLoadedMetadata={(e) => {
                // See the equivalent block in `save-preview` /
                // `card-thumb`: codec-unsupported videos surface as a
                // 0×0 metadata frame instead of an error event. Heal
                // them anyway so users don't have to keep re-clicking
                // Refresh on cards from before the codec fix.
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
            <Tooltip content="Previous (←)" side="right">
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
            <Tooltip content="Next (→)" side="left">
              <button
                type="button"
                className={`${styles.nav} ${styles.navNext}`}
                onClick={() => setIndex((i) => (i + 1) % slides.length)}
                aria-label="Next"
              >
                ›
              </button>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
}
