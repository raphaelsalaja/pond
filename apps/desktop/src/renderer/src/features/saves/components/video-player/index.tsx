import { IconMediaPlay } from "@pond/icons";
import { Tooltip, useVideo, Video } from "@pond/ui";
import { isElement } from "@pond/ui/dom";
import log from "electron-log/renderer";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MouseEvent, ReactEventHandler, ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  useViewerChromeEnabled,
  useViewerChromeRoot,
} from "@/features/saves/components/viewers/media-viewer/chrome";
import { useReportMediaReady } from "@/features/saves/hooks/use-media-ready";
import { useMediaReveal } from "@/features/saves/hooks/use-media-reveal";
import { useSave } from "@/features/saves/hooks/use-saves";
import { containImage } from "@/features/saves/lib/image-regions";
import type { ChapterCue } from "@/features/saves/lib/media/chapters-vtt";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import { viewerMemory } from "@/features/saves/lib/viewer-memory";
import { cardThumbnailFor } from "@/features/saves/state/card-thumbnails";
import { usePrefs } from "@/shared/state/prefs";
import { videoScaleForRotation } from "./geometry";
import { MediaBridge } from "./media-bridge";
import { Poster } from "./poster";
import { TimelinePreview } from "./timeline-preview";
import { PlayerButton } from "./toolbar-buttons";
import { VideoToolbarContent } from "./toolbar-content";
import type { VideoToolbarSlots } from "./toolbar-content";
import { useChaptersTrackUrl } from "./use-chapters-track-url";
import { useFirstFrame } from "./use-first-frame";
import { VolumeControl } from "./volume";
import { WheelBridge } from "./wheel-bridge";
import styles from "./styles.module.css";

/** Drawn over the frame. A click on one belongs to that control, not playback. */
const SURFACE_CONTROLS =
  "button, a, input, select, textarea, label, [role='button'], [role='slider'], [role='menuitem'], [role='option'], [role='combobox']";

interface ViewerSize {
  width: number;
  height: number;
}

function measureViewer(root: HTMLElement): ViewerSize {
  return { width: root.clientWidth, height: root.clientHeight };
}

interface VideoPlayerProps {
  src: string;
  saveId?: string;
  fileIndex?: number;
  poster?: string;
  posterIsCrossFile?: boolean;
  title?: string | null;
  artist?: string | null;
  chapters?: ReadonlyArray<ChapterCue>;
  active?: boolean;
  width?: number | null;
  height?: number | null;
  onRatio?: (ratio: number) => void;
  onError?: () => void;
  renderToolbar?: (slots: VideoToolbarSlots) => ReactNode;
  measure?: (root: HTMLElement) => ViewerSize;
}

/**
 * The icon follows `state.playing`. Autoplay starts on the next frame, so the
 * icon stays hidden until that play when autoplay is on, and shows immediately
 * when a preview opens already paused.
 */
function PlayIndicator({ active, src }: { active: boolean; src: string }) {
  const { state } = useVideo();
  const [viewer] = usePrefs("viewer");
  const [played, setPlayed] = useState({ src, started: false });
  const started = played.src === src && played.started;
  if (played.src !== src || (state.playing && !started)) {
    setPlayed({ src, started: state.playing });
  }
  if (!active) {
    return null;
  }
  const visible =
    !state.playing &&
    (started || state.ended || viewer.autoplayVideo === false);
  return (
    <div
      className={styles.indicator}
      data-play-indicator=""
      data-paused={visible || undefined}
      aria-hidden
    >
      <IconMediaPlay />
    </div>
  );
}

/** Fits the video and its posters into one box so the open and close transitions morph the visible frame, not the letterboxed stage. */
function VideoSurface({
  src,
  active,
  trackUrl,
  subtitleUrl,
  rotation,
  mirrored,
  ratio,
  placeholder,
  onError,
  onLoadedMetadata,
  measure,
  children,
}: {
  src: string;
  active: boolean;
  trackUrl: string | null;
  subtitleUrl: string | null;
  rotation: number;
  mirrored: boolean;
  ratio: number | null;
  placeholder?: string;
  onError?: () => void;
  onLoadedMetadata: ReactEventHandler<HTMLVideoElement>;
  measure: (root: HTMLElement) => ViewerSize;
  children?: ReactNode;
}) {
  const { actions } = useVideo();
  const frame = useRef<HTMLDivElement>(null);
  const shown = useMediaReveal(useFirstFrame(src), src);
  const [loadedPoster, setLoadedPoster] = useState<string | null>(null);
  useReportMediaReady(
    shown || (placeholder !== undefined && loadedPoster === placeholder),
  );
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  /**
   * The fitted box must exist before first paint so the video never shows at its unfitted size.
   * @remarks Measures the frame's parent because the root's ref is not attached yet when a child layout effect runs.
   */
  useLayoutEffect(() => {
    const root = frame.current?.parentElement;
    if (!root) {
      return;
    }
    const update = () => {
      const { width, height } = measure(root);
      setViewerSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    update();
    if (!globalThis.ResizeObserver) {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure]);
  const scale = videoScaleForRotation(
    viewerSize.width,
    viewerSize.height,
    ratio,
    rotation,
  );
  const fitted =
    ratio && viewerSize.width && viewerSize.height
      ? containImage({ left: 0, top: 0, ...viewerSize }, ratio)
      : null;
  /**
   * Toolbar, timeline, and other overlays sit outside the media element, so
   * a click on them does not bubble here. Portal clicks do bubble to
   * `Video.Root`, which is why the handler is not on the root.
   */
  const onSurfaceClick = (event: MouseEvent<HTMLVideoElement>) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const { target } = event;
    if (!isElement(target) || target.closest(SURFACE_CONTROLS)) {
      return;
    }
    actions.togglePlay();
  };

  return (
    <div
      ref={frame}
      className={styles.frame}
      data-toggle={active || undefined}
      style={
        fitted
          ? {
              left: fitted.left,
              top: fitted.top,
              width: fitted.width,
              height: fitted.height,
            }
          : undefined
      }
    >
      <Poster.Start
        src={placeholder}
        covered={shown}
        onLoad={() => setLoadedPoster(placeholder ?? null)}
      />
      <Video.Media
        className={styles.media}
        data-pending={!shown || undefined}
        src={src}
        preload="metadata"
        onClick={active ? onSurfaceClick : undefined}
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
        style={{
          objectFit: "contain",
          transform: `scale(${scale}) rotate(${rotation}deg) scaleX(${mirrored ? -1 : 1})`,
        }}
      >
        {trackUrl ? (
          <track kind="chapters" src={trackUrl} default label="Chapters" />
        ) : null}
        {subtitleUrl ? (
          <track kind="subtitles" src={subtitleUrl} default label="Subtitles" />
        ) : null}
      </Video.Media>
      {children}
      <PlayIndicator active={active} src={src} />
    </div>
  );
}

export function VideoPlayer({
  src,
  saveId,
  fileIndex = 0,
  poster,
  posterIsCrossFile,
  title,
  artist,
  chapters,
  active,
  width,
  height,
  onRatio,
  onError,
  renderToolbar,
  measure = measureViewer,
}: VideoPlayerProps) {
  const save = useSave(saveId);
  const [viewer] = usePrefs("viewer");
  const chromeRoot = useViewerChromeRoot();
  const chrome = useViewerChromeEnabled();
  const trackUrl = useChaptersTrackUrl(chapters);
  const subtitle = save?.files.find((file) => file.kind === "subtitle");
  const subtitleUrl = save && subtitle ? buildPondUrl(save.id, subtitle) : null;
  const timingKey = `${saveId ?? ""}:${fileIndex}:${src}`;
  const [timing, setTiming] = useState<{
    key: string;
    frameRate: number | null;
  } | null>(null);
  const frameRate = timing?.key === timingKey ? timing.frameRate : null;
  const [loopRange, setLoopRange] = useState<[number, number] | null>(() =>
    viewerMemory.loop(src),
  );
  const [loopKey, setLoopKey] = useState(timingKey);
  if (timingKey !== loopKey) {
    setLoopKey(timingKey);
    setLoopRange(viewerMemory.loop(src));
  }
  useEffect(() => {
    if (!saveId) {
      return;
    }
    let current = true;
    const key = `${saveId}:${fileIndex}:${src}`;
    void window.pond
      .query("saves.mediaTiming", { id: saveId, fileIndex })
      .then((result) => {
        if (current) {
          setTiming({ key, frameRate: result.frameRate });
        }
      })
      .catch((cause: unknown) => {
        log.warn("[pond video] reading media timing failed", cause);
      });
    return () => {
      current = false;
    };
  }, [saveId, fileIndex, src]);
  const changeLoop = (range: [number, number] | null) => {
    viewerMemory.setLoop(src, range);
    setLoopRange(range);
  };

  const [loopOverride, setLoopOverride] = useState<{
    src: string;
    enabled: boolean;
  } | null>(null);
  const activeLoopOverride =
    loopOverride?.src === src ? loopOverride.enabled : null;
  const [rotation, setRotation] = useState(0);
  const [mirrored, setMirrored] = useState(false);

  const [ratio, setRatio] = useState<number | null>(
    width && height ? width / height : null,
  );
  const sizeKey = `${width}x${height}`;
  const [ratioSizeKey, setRatioSizeKey] = useState(sizeKey);
  if (sizeKey !== ratioSizeKey) {
    setRatioSizeKey(sizeKey);
    if (width && height) setRatio(width / height);
  }

  useEffect(() => {
    if (ratio && onRatio) onRatio(ratio);
  }, [ratio, onRatio]);

  const onLoadedMetadata = useCallback<ReactEventHandler<HTMLVideoElement>>(
    (event) => {
      const video = event.currentTarget;
      if (video.videoWidth && video.videoHeight) {
        setRatio(video.videoWidth / video.videoHeight);
      }
    },
    [],
  );

  return (
    <Video.Root
      frameRate={frameRate}
      fullscreenTarget={chromeRoot}
      initialMuted={viewer.videoMuted}
      chrome={chrome}
    >
      <MediaBridge
        key={src}
        src={src}
        active={!!active}
        title={title}
        artist={artist}
        artworkUrl={poster}
        loopRange={loopRange}
        loopOverride={activeLoopOverride}
      />
      <WheelBridge />
      <VideoSurface
        src={src}
        active={!!active}
        trackUrl={trackUrl}
        subtitleUrl={subtitleUrl}
        rotation={rotation}
        mirrored={mirrored}
        ratio={ratio}
        placeholder={
          cardThumbnailFor(src) ?? (posterIsCrossFile ? undefined : poster)
        }
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
        measure={measure}
      >
        <Poster.End src={poster} />
      </VideoSurface>
      {active && !chrome ? (
        <Video.Controls role="toolbar" aria-label="Playback">
          <Video.Row>
            <Video.PlayButton />
            <Video.CurrentTime aria-label="Elapsed time" />
            <div className={styles.timeline}>
              <Video.Scrubber
                renderPreview={(time) => (
                  <TimelinePreview src={src} time={time} />
                )}
              />
            </div>
            <Video.Duration aria-label="Duration" />
            <Video.MuteButton />
          </Video.Row>
        </Video.Controls>
      ) : null}
      {active && chrome ? (
        <>
          <VideoToolbarContent
            save={save}
            fileIndex={fileIndex}
            mirrored={mirrored}
            onMirror={() => setMirrored((value) => !value)}
            onRotate={() => setRotation((value) => (value + 90) % 360)}
            render={renderToolbar}
          />
          <ChromePortal slot="bottom">
            <Tooltip.Group>
              <Video.Controls
                className={styles.controls}
                role="toolbar"
                aria-label="Playback"
              >
                <Video.Row className={styles.row}>
                  <ViewerHud.Pill>
                    <PlayerButton.Playback />
                  </ViewerHud.Pill>
                  <ViewerHud.Pill>
                    <VolumeControl />
                  </ViewerHud.Pill>
                  <ViewerHud.Pill className={styles.scrub}>
                    <Video.CurrentTime
                      className={styles["current-time"]}
                      aria-label="Elapsed time"
                    />
                    <div className={styles.timeline}>
                      <Video.Scrubber
                        renderPreview={(time) => (
                          <TimelinePreview src={src} time={time} />
                        )}
                      />
                    </div>
                    <Video.Duration
                      className={styles.duration}
                      aria-label="Duration"
                    />
                  </ViewerHud.Pill>
                  <ViewerHud.Pill className={styles.speed}>
                    <Video.SpeedSelect />
                  </ViewerHud.Pill>
                  <ViewerHud.Pill>
                    <PlayerButton.Loop
                      range={loopRange}
                      override={activeLoopOverride}
                      onRangeChange={changeLoop}
                      onOverrideChange={(enabled) =>
                        setLoopOverride({ src, enabled })
                      }
                    />
                  </ViewerHud.Pill>
                  <PlayerButton.Fullscreen />
                </Video.Row>
              </Video.Controls>
            </Tooltip.Group>
          </ChromePortal>
        </>
      ) : null}
    </Video.Root>
  );
}
