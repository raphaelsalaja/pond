import { useCallback, useEffect, useRef, useState } from "react";
import { VideoPlayer } from "@/features/saves/components/video-player";
import { GeneratedRasterViewer } from "@/features/saves/components/viewers/generated-raster-viewer";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ImageInspector } from "@/features/saves/components/viewers/image-inspector";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { OriginalFileActions } from "@/features/saves/components/viewers/original-file-actions";
import { ViewerFallback } from "@/features/saves/components/viewers/viewer-fallback";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import { ViewerToolbarGroups } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import type { ChapterCue } from "@/features/saves/lib/media/chapters-vtt";
import { beginSaveDrag } from "@/features/saves/lib/start-drag";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

export interface MediaSlide {
  src: string;
  fileIndex: number;
  isVideo: boolean;
  isAnimation?: boolean;
  generated?: boolean;
  posterUrl?: string;
  width?: number;
  height?: number;
}

type ProviderState =
  | { status: "direct" }
  | { status: "generated" }
  | { status: "fallback"; reason: "decode" | "preview" };

interface SlideProps {
  slide: MediaSlide;
  active: boolean;
  inView: boolean;
  save: Save;
  onNavigate?: (id: string) => void;
  title?: string | null;
  artist?: string | null;
  chapters?: ChapterCue[];
  ratio?: number;
  onRatio?: (src: string, ratio: number) => void;
}

function knownRatio(slide: MediaSlide): number | null {
  return slide.width && slide.height ? slide.width / slide.height : null;
}

export function Slide({
  slide,
  active,
  inView,
  save,
  onNavigate,
  title,
  artist,
  chapters,
  ratio,
  onRatio,
}: SlideProps) {
  const [provider, setProvider] = useState<ProviderState>(() =>
    slide.generated ? { status: "generated" } : { status: "direct" },
  );
  const file = save.files[slide.fileIndex];
  const onProviderError = () => {
    setProvider((current) => {
      if (!slide.isVideo && current.status === "direct") {
        return { status: "generated" };
      }
      return {
        status: "fallback",
        reason: current.status === "generated" ? "preview" : "decode",
      };
    });
  };

  return (
    <div
      className={styles.slide}
      data-blossom-slide
      data-file-index={slide.fileIndex}
      data-active={active ? "true" : undefined}
    >
      {provider.status === "fallback" && file ? (
        <ViewerFallback
          save={save}
          file={file}
          fileIndex={slide.fileIndex}
          reason={provider.reason}
          active={active}
        />
      ) : slide.isVideo ? (
        inView ? (
          <VideoSlide
            slide={slide}
            saveId={save.id}
            active={active}
            title={title}
            artist={artist}
            chapters={chapters}
            ratioOverride={ratio}
            onRatio={onRatio}
            onError={onProviderError}
          />
        ) : (
          <PosterSlide slide={slide} saveId={save.id} />
        )
      ) : (
        <ImageSlide
          slide={slide}
          active={active}
          save={save}
          onNavigate={onNavigate}
          ratioOverride={ratio}
          onRatio={onRatio}
          provider={provider.status === "generated" ? "generated" : "direct"}
          onError={onProviderError}
        />
      )}
    </div>
  );
}

function useResolvedRatio(slide: MediaSlide, override?: number) {
  const [local, setLocal] = useState<number | null>(() => knownRatio(slide));
  return { ratio: override ?? local, setLocal };
}

function VideoSlide({
  slide,
  saveId,
  active,
  title,
  artist,
  chapters,
  ratioOverride,
  onRatio,
  onError,
}: {
  slide: MediaSlide;
  saveId: string;
  active: boolean;
  title?: string | null;
  artist?: string | null;
  chapters?: ChapterCue[];
  ratioOverride?: number;
  onRatio?: (src: string, ratio: number) => void;
  onError: () => void;
}) {
  const { setLocal } = useResolvedRatio(slide, ratioOverride);
  const [playbackSrc, setPlaybackSrc] = useState(slide.src);
  const attemptedCompatiblePreview = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    attemptedCompatiblePreview.current = false;
    setPlaybackSrc(slide.src);
    return () => {
      requestId.current += 1;
    };
  }, [slide.src]);

  const handlePlaybackError = useCallback(() => {
    if (attemptedCompatiblePreview.current) {
      onError();
      return;
    }
    attemptedCompatiblePreview.current = true;
    const currentRequest = ++requestId.current;
    void window.pond
      .query("video.preparePreview", { src: slide.src })
      .then((result) => {
        if (requestId.current !== currentRequest) return;
        if (result.ok && result.url) {
          setPlaybackSrc(result.url);
          return;
        }
        onError();
      })
      .catch(() => {
        if (requestId.current === currentRequest) onError();
      });
  }, [onError, slide.src]);

  return (
    <div className={styles["media-shell"]}>
      <VideoPlayer
        key={playbackSrc}
        src={playbackSrc}
        saveId={saveId}
        fileIndex={slide.fileIndex}
        poster={slide.posterUrl}
        title={title}
        artist={artist}
        active={active}
        width={slide.width}
        height={slide.height}
        chapters={chapters}
        onRatio={(r) => {
          setLocal(r);
          onRatio?.(slide.src, r);
        }}
        onError={handlePlaybackError}
        renderToolbar={({ actions, edits }) =>
          active ? (
            <ChromePortal slot="top">
              <ViewerHud.Bar
                label="Video"
                start={<ViewerSaveNav saveId={saveId} />}
                center={<ViewerToolbarGroups actions={actions} edits={edits} />}
              />
            </ChromePortal>
          ) : null
        }
      />
    </div>
  );
}

function PosterSlide({ slide, saveId }: { slide: MediaSlide; saveId: string }) {
  if (!slide.posterUrl) return <div className={styles["media-shell"]} />;
  return (
    <button
      type="button"
      className={styles["media-shell"]}
      aria-label="Drag save"
      draggable
      onDragStart={(event) => {
        beginSaveDrag(saveId, event);
      }}
    >
      <img
        src={slide.posterUrl}
        alt=""
        className={styles.media}
        decoding="async"
        draggable={false}
        width={slide.width}
        height={slide.height}
      />
    </button>
  );
}

function ImageSlide({
  slide,
  active,
  save,
  onNavigate,
  ratioOverride,
  onRatio,
  provider,
  onError,
}: {
  slide: MediaSlide;
  active: boolean;
  save: Save;
  onNavigate?: (id: string) => void;
  ratioOverride?: number;
  onRatio?: (src: string, ratio: number) => void;
  provider: "direct" | "generated";
  onError: () => void;
}) {
  const { setLocal } = useResolvedRatio(slide, ratioOverride);
  return (
    <div className={styles["media-shell"]}>
      {provider === "generated" ? (
        <GeneratedRasterViewer
          key={slide.src}
          save={save}
          fileIndex={slide.fileIndex}
          url={slide.src}
          active={active}
          onNavigate={onNavigate}
          onRatio={(ratio) => {
            setLocal(ratio);
            onRatio?.(slide.src, ratio);
          }}
          onError={onError}
        />
      ) : (
        <ImageInspector
          key={slide.src}
          save={save}
          fileIndex={slide.fileIndex}
          src={slide.src}
          active={active}
          endActions={
            <OriginalFileActions save={save} fileIndex={slide.fileIndex} />
          }
          onNavigate={onNavigate}
          onRatio={(ratio) => {
            setLocal(ratio);
            onRatio?.(slide.src, ratio);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}
