import { IconXmarkOutline18 } from "@pond/icons/outline";
import { Button, Dialog, Tooltip } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { extractYouTubeId } from "@/components/save-preview/helpers";
import { requestVideoHeal } from "@/pool/heal";
import { useSave } from "@/pool/hooks";
import { buildMediaUnits } from "@/pool/media";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

function Root() {
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
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Content data-size="fullscreen">
        {save ? (
          <Body save={save} onClose={close} />
        ) : (
          <Empty>
            <p>Save not found.</p>
            <Button onClick={close}>Close</Button>
          </Empty>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Body({ save, onClose }: { save: Save; onClose: () => void }) {
  // `buildMediaUnits` already pairs videos with their poster JPGs and
  // dedupes — see `pool/media.ts`.
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

  // Drop slides whose `pond://` URL 404s in this session so users
  // never see the giant "broken image" icon over the dim canvas. The
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
  // `close()`), so don't handle it here.
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

  const youtubeId = useMemo(() => extractYouTubeId(save.url), [save.url]);

  if (slides.length === 0) {
    if (youtubeId) {
      return (
        <Stage>
          <Toolbar>
            <TitleStrip>{save.title ?? save.url}</TitleStrip>
            <Tooltip.Root content="Close (Esc)">
              <Button
                variant="ghost"
                size="sm"
                icon
                onClick={onClose}
                aria-label="Close preview"
              >
                <IconXmarkOutline18 width={14} height={14} />
              </Button>
            </Tooltip.Root>
          </Toolbar>
          <Canvas>
            <MediaShell>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
                className={styles.embed}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={save.title ?? "YouTube video"}
              />
            </MediaShell>
          </Canvas>
        </Stage>
      );
    }
    return (
      <Empty>
        <p>{save.title ?? save.url}</p>
        <EmptyHint>No local media to preview.</EmptyHint>
        <Button onClick={onClose}>Close</Button>
      </Empty>
    );
  }

  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <Stage>
      <Toolbar>
        <TitleStrip>
          {save.title ?? save.url}
          {hasMany ? (
            <Counter>
              {index + 1} / {slides.length}
            </Counter>
          ) : null}
        </TitleStrip>
        <Tooltip.Root content="Close (Esc)">
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={onClose}
            aria-label="Close preview"
          >
            <IconXmarkOutline18 width={14} height={14} />
          </Button>
        </Tooltip.Root>
      </Toolbar>

      <Canvas>
        <MediaShell>
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
                requestVideoHeal(save.id, slide.src);
              }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.readyState < HTMLMediaElement.HAVE_METADATA) return;
                if (v.videoWidth === 0 && v.videoHeight === 0) {
                  markBroken(slide.src);
                  requestVideoHeal(save.id, slide.src);
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
        </MediaShell>

        {hasMany ? (
          <>
            <Tooltip.Root content="Previous (←)" side="right">
              <Nav
                data-side="prev"
                aria-label="Previous"
                onClick={() =>
                  setIndex((i) => (i - 1 + slides.length) % slides.length)
                }
              >
                ‹
              </Nav>
            </Tooltip.Root>
            <Tooltip.Root content="Next (→)" side="left">
              <Nav
                data-side="next"
                aria-label="Next"
                onClick={() => setIndex((i) => (i + 1) % slides.length)}
              >
                ›
              </Nav>
            </Tooltip.Root>
          </>
        ) : null}
      </Canvas>
    </Stage>
  );
}

interface StageProps extends React.ComponentPropsWithoutRef<"div"> {}

function Stage({ className, ...props }: StageProps) {
  return (
    <div
      className={[styles.stage, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ToolbarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <div
      className={[styles.toolbar, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface TitleStripProps extends React.ComponentPropsWithoutRef<"span"> {}

function TitleStrip({ className, ...props }: TitleStripProps) {
  return (
    <span
      className={[styles["title-strip"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface CounterProps extends React.ComponentPropsWithoutRef<"span"> {}

function Counter({ className, ...props }: CounterProps) {
  return (
    <span
      className={[styles.counter, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface CanvasProps extends React.ComponentPropsWithoutRef<"div"> {}

function Canvas({ className, ...props }: CanvasProps) {
  return (
    <div
      className={[styles.canvas, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface MediaShellProps extends React.ComponentPropsWithoutRef<"div"> {}

function MediaShell({ className, ...props }: MediaShellProps) {
  return (
    <div
      className={[styles["media-shell"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface NavProps extends React.ComponentPropsWithoutRef<"button"> {
  "data-side": "prev" | "next";
}

function Nav({ className, type = "button", ...props }: NavProps) {
  return (
    <button
      type={type}
      className={[styles.nav, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface EmptyProps extends React.ComponentPropsWithoutRef<"div"> {}

function Empty({ className, ...props }: EmptyProps) {
  return (
    <div
      className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface EmptyHintProps extends React.ComponentPropsWithoutRef<"p"> {}

function EmptyHint({ className, ...props }: EmptyHintProps) {
  return (
    <p
      className={[styles["empty-hint"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

export const MediaLightbox = {
  Root,
  Stage,
  Toolbar,
  TitleStrip,
  Counter,
  Canvas,
  MediaShell,
  Nav,
  Empty,
  EmptyHint,
};

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
}
