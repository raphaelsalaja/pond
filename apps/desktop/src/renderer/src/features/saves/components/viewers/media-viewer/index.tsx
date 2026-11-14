import { useHotkey } from "@tanstack/react-hotkeys";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ViewerChrome } from "@/features/saves/components/viewers/media-viewer/chrome";
import {
  type MediaSlide,
  Slide,
} from "@/features/saves/components/viewers/media-viewer/slide";
import {
  copyVideoFrame,
  saveVideoFrame,
} from "@/features/saves/lib/media/capture-frame";
import {
  type ChapterCue,
  chaptersForSave,
} from "@/features/saves/lib/media/chapters-vtt";
import { buildMediaUnits } from "@/features/saves/lib/media/units";
import { openSave } from "@/features/saves/lib/save-nav";
import type { Save } from "@/features/saves/types";
import { useResolvedTheme } from "@/shared/hooks/use-resolved-theme";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import {
  useActiveSlide,
  useCarouselNavigation,
  useLockedSlideRatio,
} from "./lib/use-carousel";
import styles from "./styles.module.css";

export interface ViewerNav {
  step: (delta: number) => boolean;
}

interface MediaViewerProps {
  save: Save;
  onNavigate?: (id: string) => void;
  onActiveFileIndexChange?: (fileIndex: number | null) => void;
  navRef?: RefObject<ViewerNav | null>;
  showControls?: boolean;
}

function slideIdentity(slide: MediaSlide): string {
  const provider = slide.isVideo
    ? "video"
    : slide.generated
      ? "generated"
      : "direct";
  return `${slide.src}:${provider}`;
}

export function MediaViewer({
  save,
  onNavigate = openSave,
  onActiveFileIndexChange,
  navRef,
  showControls = true,
}: MediaViewerProps) {
  const theme = useResolvedTheme();
  const chapters = useMemo<ChapterCue[]>(() => chaptersForSave(save), [save]);
  const singleVideo = useMemo(
    () =>
      buildMediaUnits(save, { theme }).filter((u) => u.isVideo).length === 1,
    [save, theme],
  );
  const allSlides = useMemo<MediaSlide[]>(
    () =>
      buildMediaUnits(save, { theme }).flatMap((u) => {
        const fileIndex = save.files.findIndex((f) => f.path === u.key);
        if (fileIndex < 0) return [];
        const file = save.files[fileIndex];
        const poster = u.posterKey
          ? save.files.find((f) => f.path === u.posterKey)
          : undefined;
        const size = [file, save, poster].find(
          (source) => source?.width && source.height,
        );
        return [
          {
            src: u.url,
            fileIndex,
            isVideo: u.isVideo,
            generated: u.requiresGeneratedPreview,
            isAnimation:
              file?.mimeType === "image/gif" ||
              /\.gif$/i.test(file?.path ?? ""),
            posterUrl: u.posterUrl,
            width: size?.width ?? undefined,
            height: size?.height ?? undefined,
          },
        ];
      }),
    [save, theme],
  );

  const slides = allSlides;
  const slideChapters = singleVideo ? chapters : undefined;

  const firstFileIndex = slides[0]?.fileIndex ?? null;

  useEffect(() => {
    if (slides.length === 0) {
      onActiveFileIndexChange?.(null);
      return;
    }
    if (slides.length !== 1) return;
    onActiveFileIndexChange?.(firstFileIndex);
  }, [slides.length, firstFileIndex, onActiveFileIndexChange]);

  if (slides.length === 0) {
    return null;
  }

  if (slides.length === 1) {
    const only = slides[0];
    if (!only) return null;
    return (
      <MediaViewerFrame showControls={showControls}>
        <Slide
          key={slideIdentity(only)}
          slide={only}
          save={save}
          onNavigate={onNavigate}
          active
          inView
          title={save.title}
          artist={save.author}
          chapters={slideChapters}
        />
      </MediaViewerFrame>
    );
  }

  return (
    <Carousel
      key={save.id}
      save={save}
      onNavigate={onNavigate}
      slides={slides}
      chapters={slideChapters}
      onActiveFileIndexChange={onActiveFileIndexChange}
      navRef={navRef}
      showControls={showControls}
    />
  );
}

export function MediaViewerFrame({
  children,
  showControls,
}: {
  children: React.ReactNode;
  showControls: boolean;
}) {
  const shortcuts = useShortcutBindings();
  const ref = useRef<HTMLDivElement>(null);

  const activeVideo = () => {
    const root = ref.current;
    const video = root?.querySelector("[data-blossom-slide]")
      ? root.querySelector("[data-blossom-slide][data-active] video")
      : root?.querySelector("video");
    return video instanceof HTMLVideoElement && video.videoWidth ? video : null;
  };

  useHotkey(
    bindingKeys(shortcuts, "viewer.copy-frame"),
    (event) => {
      const video = activeVideo();
      if (!video) return;
      event.preventDefault();
      void copyVideoFrame(video);
    },
    { preventDefault: false, ignoreInputs: true },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.save-frame"),
    (event) => {
      const video = activeVideo();
      if (!video) return;
      event.preventDefault();
      void saveVideoFrame(video);
    },
    { preventDefault: false, ignoreInputs: true },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.mute"),
    (event) => {
      const video = activeVideo();
      if (!video) return;
      event.preventDefault();
      video.muted = !video.muted;
    },
    { preventDefault: false, ignoreInputs: true },
  );

  return (
    <div ref={ref} className={styles.carousel}>
      <ViewerChrome enabled={showControls}>{children}</ViewerChrome>
    </div>
  );
}

function Carousel({
  save,
  onNavigate,
  slides,
  chapters,
  onActiveFileIndexChange,
  navRef,
  showControls,
}: {
  save: Save;
  onNavigate: (id: string) => void;
  slides: MediaSlide[];
  chapters?: ChapterCue[];
  onActiveFileIndexChange?: (fileIndex: number | null) => void;
  navRef?: RefObject<ViewerNav | null>;
  showControls: boolean;
}) {
  const shortcuts = useShortcutBindings();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const active = useActiveSlide(scroller, slides.length);
  const { ratios, reportRatio } = useLockedSlideRatio();
  const { goPrev, goNext, step } = useCarouselNavigation(scroller, ratios);

  useHotkey(
    bindingKeys(shortcuts, "viewer.prev-slide"),
    (event) => {
      event.preventDefault();
      goPrev();
    },
    {
      preventDefault: false,
      ignoreInputs: true,
      conflictBehavior: "allow",
      enabled: !(slides[active]?.isVideo || slides[active]?.isAnimation),
    },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.next-slide"),
    (event) => {
      event.preventDefault();
      goNext();
    },
    {
      preventDefault: false,
      ignoreInputs: true,
      conflictBehavior: "allow",
      enabled: !(slides[active]?.isVideo || slides[active]?.isAnimation),
    },
  );

  useEffect(() => {
    onActiveFileIndexChange?.(slides[active]?.fileIndex ?? null);
  }, [active, slides, onActiveFileIndexChange]);

  useEffect(() => {
    if (!navRef) return;
    navRef.current = { step };
    return () => {
      navRef.current = null;
    };
  }, [navRef, step]);

  return (
    <MediaViewerFrame showControls={showControls}>
      <div ref={setScroller} className={styles.scroller}>
        {slides.map((s, i) => (
          <Slide
            key={slideIdentity(s)}
            slide={s}
            save={save}
            onNavigate={onNavigate}
            active={i === active}
            inView={Math.abs(i - active) <= 1}
            title={save.title}
            artist={save.author}
            chapters={chapters}
            ratio={ratios.get(s.src)}
            onRatio={reportRatio}
            slideNavigation={{
              index: active,
              count: slides.length,
              onPrevious: goPrev,
              onNext: goNext,
            }}
          />
        ))}
      </div>
    </MediaViewerFrame>
  );
}
