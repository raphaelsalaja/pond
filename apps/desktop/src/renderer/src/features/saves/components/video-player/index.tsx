import { Tooltip, Video } from "@pond/ui";
import {
  type ReactEventHandler,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import {
  ChromePortal,
  useViewerChromeRoot,
} from "@/features/saves/components/viewers/media-viewer/chrome";
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
import styles from "./styles.module.css";
import { TimelinePreview } from "./timeline-preview";
import { PlayerButton } from "./toolbar-buttons";
import { VideoToolbarContent, type VideoToolbarSlots } from "./toolbar-content";
import { useChaptersTrackUrl } from "./use-chapters-track-url";
import { useFirstFrame } from "./use-first-frame";
import { VolumeControl } from "./volume";
import { WheelBridge } from "./wheel-bridge";

interface VideoPlayerProps {
  src: string;
  saveId?: string;
  fileIndex?: number;
  poster?: string;
  title?: string | null;
  artist?: string | null;
  chapters?: readonly ChapterCue[];
  active?: boolean;
  width?: number | null;
  height?: number | null;
  onRatio?: (ratio: number) => void;
  onError?: () => void;
  renderToolbar?: (slots: VideoToolbarSlots) => ReactNode;
}

/** Fits the video and its posters into one box so the open and close transitions morph the visible frame, not the letterboxed stage. */
function VideoSurface({
  src,
  trackUrl,
  subtitleUrl,
  rotation,
  mirrored,
  ratio,
  placeholder,
  onError,
  onLoadedMetadata,
  children,
}: {
  src: string;
  trackUrl: string | null;
  subtitleUrl: string | null;
  rotation: number;
  mirrored: boolean;
  ratio: number | null;
  placeholder?: string;
  onError?: () => void;
  onLoadedMetadata: ReactEventHandler<HTMLVideoElement>;
  children?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const shown = useMediaReveal(useFirstFrame(src), src);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  /**
   * The fitted box must exist before first paint so the video never shows at its unfitted size.
   * @remarks Measures the frame's parent because the root's ref is not attached yet when a child layout effect runs.
   */
  useLayoutEffect(() => {
    const root = frame.current?.parentElement;
    if (!root) return;
    const measure = () => {
      const width = root.clientWidth;
      const height = root.clientHeight;
      setViewerSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
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
  return (
    <div
      ref={frame}
      className={styles.frame}
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
      <Poster.Start src={placeholder} covered={shown} />
      <Video.Media
        className={styles.media}
        data-pending={!shown || undefined}
        src={src}
        preload="metadata"
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
    </div>
  );
}

export function VideoPlayer({
  src,
  saveId,
  fileIndex = 0,
  poster,
  title,
  artist,
  chapters,
  active,
  width,
  height,
  onRatio,
  onError,
  renderToolbar,
}: VideoPlayerProps) {
  const save = useSave(saveId);
  const [viewer] = usePrefs("viewer");
  const chromeRoot = useViewerChromeRoot();
  const trackUrl = useChaptersTrackUrl(chapters);
  const subtitle = save?.files.find((file) => file.kind === "subtitle");
  const subtitleUrl = save && subtitle ? buildPondUrl(save.id, subtitle) : null;
  const [frameRate, setFrameRate] = useState<number | null>(null);
  const [loopRange, setLoopRange] = useState<[number, number] | null>(() =>
    viewerMemory.loop(src),
  );
  useEffect(() => {
    setFrameRate(null);
    setLoopRange(viewerMemory.loop(src));
    if (!saveId) return;
    let current = true;
    void window.pond
      .query("saves.mediaTiming", { id: saveId, fileIndex })
      .then((timing) => {
        if (current) setFrameRate(timing.frameRate);
      })
      .catch(() => {});
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
      chrome
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
        trackUrl={trackUrl}
        subtitleUrl={subtitleUrl}
        rotation={rotation}
        mirrored={mirrored}
        ratio={ratio}
        placeholder={cardThumbnailFor(src) ?? poster}
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
      >
        <Poster.End src={poster} />
      </VideoSurface>
      {active ? (
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
