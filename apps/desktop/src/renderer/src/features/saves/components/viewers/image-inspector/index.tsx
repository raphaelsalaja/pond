import type { ImageCrop } from "@pond/schema/db";
import { isStaticThumbnailFile } from "@shared/media-index";
import { pickCardFile } from "@shared/save-file-names";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import type { ViewerNavigation } from "@/features/saves/components/viewers/viewer-toolbar-groups";
import { useGifPlayer } from "@/features/saves/hooks/use-gif-player";
import { useImageDecoded } from "@/features/saves/hooks/use-image-decoded";
import { useReportMediaReady } from "@/features/saves/hooks/use-media-ready";
import { useMediaReveal } from "@/features/saves/hooks/use-media-reveal";
import {
  fullImageCrop,
  isFullImageCrop,
} from "@/features/saves/lib/image-regions";
import {
  applyInspect,
  cropPatch,
  flipPatch,
  rotatePatch,
} from "@/features/saves/lib/inspect-actions";
import { buildOriginalMediaUnits } from "@/features/saves/lib/media/units";
import { pondFileUrl } from "@/features/saves/lib/media/url";
import { mediaTransformStyle } from "@/features/saves/lib/media-transform";
import { beginSaveDrag } from "@/features/saves/lib/start-drag";
import { FIT_POSE, zoomImageAt } from "@/features/saves/lib/viewer-memory";
import { cardThumbnailFor } from "@/features/saves/state/card-thumbnails";
import { useInspect } from "@/features/saves/state/inspect";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { useViewerEscapeLayer } from "@/features/saves/state/viewer-escape";
import type { Save } from "@/features/saves/types";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { usePrefs } from "@/shared/state/prefs";
import { ImageControls } from "./controls";
import { GifContextMenu } from "./gif-menu";
import { createImageGestures, type ImageDrag } from "./image-gestures";
import { Navigator } from "./navigator";
import { ImageOverlay } from "./overlay";
import styles from "./styles.module.css";
import type { InspectorMode } from "./types";
import { useCropKeyboard } from "./use-crop-keyboard";
import { useImageViewport } from "./use-image-viewport";

interface ImageInspectorProps {
  save: Save;
  fileIndex?: number;
  src: string;
  active: boolean;
  onRatio: (ratio: number) => void;
  onError: () => void;
  onNavigate?: (id: string) => void;
  edits?: "full" | "none";
  endActions?: ReactNode;
  slideNavigation?: ViewerNavigation;
}

export function ImageInspector({
  save,
  fileIndex = 0,
  src,
  active,
  onRatio,
  onError,
  onNavigate,
  edits = "full",
  endActions,
  slideNavigation,
}: ImageInspectorProps) {
  const [prefs] = usePrefs("viewer");
  const instructionsId = useId();
  const { grayscale, showNavigator } = useInspect();
  const file = save.files[fileIndex];
  const isGif =
    file?.mimeType === "image/gif" ||
    /\.gif(?:$|[?#])/i.test(file?.path ?? src);
  const carouselImages = buildOriginalMediaUnits(save).filter(
    (unit) => !unit.isVideo,
  );
  const canSetImageThumbnail =
    !isGif &&
    carouselImages.length > 1 &&
    carouselImages.some((unit) => unit.key === file?.path);
  const [mode, setMode] = useState<InspectorMode>("view");
  const [gifFramesOpen, setGifFramesOpen] = useState(false);
  const [draft, setDraft] = useState<ImageCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<ImageDrag | null>(null);
  const lastNavigate = useRef(0);
  const gestureMoved = useRef(false);
  const pending = useRef(false);
  const gif = useGifPlayer(
    src,
    isGif,
    active && mode === "view",
    prefs.gifAutoplay !== false,
  );
  const navigate = (delta: number) => {
    if (!onNavigate || Date.now() - lastNavigate.current < 200) return;
    lastNavigate.current = Date.now();
    void resultNavigation
      .next(save.id, delta)
      .then((next) => {
        if (next) onNavigate(next);
      })
      .catch(() => {});
  };
  const viewport = useImageViewport({
    active,
    defaultSize: prefs.defaultImageSize,
    initialRatio:
      file?.width && file.height
        ? file.width / file.height
        : save.width && save.height
          ? save.width / save.height
          : null,
    isDragging: () => drag.current !== null,
    mode,
    naturalWidth: file?.width || save.width || 0,
    onNavigate: navigate,
    onRatio,
    rememberPosition: prefs.rememberImagePosition !== false,
    src,
    wheelBehavior: prefs.wheelBehavior,
  });
  const decoded = useImageDecoded(viewport.image, src);
  const thumbnail = cardThumbnailFor(src);
  const cardFile = pickCardFile(save.files);
  /** `save.blurhash` encodes the card's still, so it only stands in for that same file. */
  const blurhash =
    cardFile && cardFile.path === file?.path && isStaticThumbnailFile(cardFile)
      ? save.blurhash
      : null;
  const shown = useMediaReveal(decoded || gif.ready, src);
  useReportMediaReady(shown);

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify({
        id: "image-inspection",
        title: "Couldn't update this image",
        description: errorCopy(error, "Try again."),
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const cancelCrop = () => {
    setMode("view");
    setDraft(null);
  };
  useViewerEscapeLayer(
    active && edits === "full" && mode === "crop",
    cancelCrop,
  );
  const toggleCrop = () => {
    const nextMode = mode === "crop" ? "view" : "crop";
    setMode(nextMode);
    setDraft(nextMode === "crop" ? fullImageCrop() : null);
    viewport.setPosition(() => FIT_POSE);
  };
  const actualSize = () => {
    const one = viewport.oneToOne;
    if (one)
      viewport.setPosition(() => ({
        zoom: Math.min(32, one),
        x: 0,
        y: 0,
      }));
  };
  const zoomOut = () =>
    viewport.setPosition((previous) =>
      zoomImageAt(previous, previous.zoom / 1.25, { x: 0, y: 0 }),
    );
  const zoomIn = () =>
    viewport.setPosition((previous) =>
      zoomImageAt(previous, previous.zoom * 1.25, { x: 0, y: 0 }),
    );
  const setZoomRatio = (ratio: number) => {
    const one = viewport.oneToOne;
    if (!one) return;
    viewport.setPosition((previous) =>
      zoomImageAt(previous, Math.min(32, ratio * one), { x: 0, y: 0 }),
    );
  };
  const setGifThumbnail = () => {
    void window.pond
      .query("saves.setGifThumbnail", {
        id: save.id,
        src,
        frameIndex: gif.frameIndex,
      })
      .then((result) => {
        if (!result.ok)
          notify({
            id: "gif-thumb",
            title: "Couldn't set this GIF frame as the thumbnail.",
          });
      });
  };
  const setImageThumbnail = () => {
    if (!file) return;
    void window.pond
      .query("saves.setImageThumbnail", {
        id: save.id,
        src: pondFileUrl(save.id, file.path),
      })
      .then((result) => {
        if (!result.ok)
          notify({
            id: "image-thumb",
            title: "Couldn't set this image as the thumbnail.",
          });
      });
  };

  const canApplyCrop =
    !!draft && draft.w > 0 && draft.h > 0 && !isFullImageCrop(draft);
  const applyCrop = () => {
    if (!draft || !canApplyCrop) return;
    void run(async () => {
      await applyInspect(save.id, cropPatch(draft), "inspect:crop");
      setDraft(null);
      setMode("view");
    });
  };
  useCropKeyboard({
    active: active && edits === "full",
    draft,
    frame: viewport.frame,
    mode,
    onApply: applyCrop,
    ratio: viewport.ratio,
    setDraft,
    setMode,
  });
  const saveCrop = () => {
    if (!draft) return;
    void run(async () => {
      const result = await window.pond.query("saves.cropAsCopy", {
        id: save.id,
        fileIndex,
        crop: draft,
        frameIndex: isGif ? gif.frameIndex : undefined,
      });
      if (!result.ok) throw new Error(result.error);
      setDraft(null);
      setMode("view");
      notify({ id: "image-crop-copy", title: "Crop saved as a new image" });
    });
  };

  const imageStyle: CSSProperties =
    mode === "view" ? mediaTransformStyle(save) : { transform: "none" };
  imageStyle.imageRendering =
    prefs.imageRendering === "pixelated" ? "pixelated" : "auto";
  if (grayscale) imageStyle.filter = "grayscale(1)";
  const previousMode = useRef(mode);
  useEffect(() => {
    const leftMode = previousMode.current !== mode && mode === "view";
    previousMode.current = mode;
    if (!active) return;
    if (mode !== "view") {
      viewport.frame.current?.focus();
      return;
    }
    const focusLost =
      !document.activeElement || document.activeElement === document.body;
    /** The crop bar unmounts with its focused button; return focus to the image instead of body. */
    if (leftMode && focusLost)
      viewport.frame.current?.focus({ preventScroll: true });
  }, [active, mode, viewport.frame]);
  const gestures = createImageGestures({
    active,
    draft,
    drag,
    gestureMoved,
    mode,
    onNavigate: navigate,
    pointFromClient: viewport.pointFromClient,
    poseZoom: viewport.pose.zoom,
    ratio: viewport.ratio,
    setDraft,
    setPosition: viewport.setPosition,
  });

  return (
    <div
      className={styles.root}
      data-active={active || undefined}
      data-gif-player={gif.ready || undefined}
    >
      <span id={instructionsId} className={styles.instructions}>
        {mode === "crop"
          ? "Crop. Edges and centers snap to guides. Arrow keys move the selection, Control or Command and arrow keys resize, Shift increases the step. Enter applies the crop. Escape cancels."
          : "Arrow keys pan. Plus and minus zoom."}
      </span>
      <div
        ref={viewport.frame}
        className={styles.frame}
        role="application"
        aria-label="Image"
        aria-describedby={instructionsId}
        tabIndex={active ? 0 : -1}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            event.nativeEvent.isComposing
          )
            return;
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (
            mode === "view" &&
            (direction || ["+", "=", "-"].includes(event.key))
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (direction)
              viewport.setPosition((previous) => ({
                ...previous,
                x:
                  previous.x -
                  (direction[0] ?? 0) * (event.shiftKey ? 100 : 20),
                y:
                  previous.y -
                  (direction[1] ?? 0) * (event.shiftKey ? 100 : 20),
              }));
            else if (event.key === "-") zoomOut();
            else zoomIn();
          }
        }}
        data-background={prefs.transparentBackground ?? "none"}
        data-mode={mode}
        {...gestures}
      >
        <div
          className={styles.position}
          data-live={viewport.live || undefined}
          style={{
            transform: `translate(${viewport.pose.x}px, ${viewport.pose.y}px) scale(${viewport.pose.zoom})`,
          }}
        >
          <div
            className={styles.content}
            style={
              viewport.size.width && viewport.size.height
                ? {
                    left: viewport.bounds.left,
                    top: viewport.bounds.top,
                    width: viewport.bounds.width,
                    height: viewport.bounds.height,
                  }
                : undefined
            }
          >
            {thumbnail || blurhash ? (
              <div
                className={styles.placeholder}
                data-covered={shown || undefined}
                aria-hidden
              >
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt=""
                    decoding="sync"
                    draggable={false}
                    style={imageStyle}
                  />
                ) : blurhash ? (
                  <BlurHash hash={blurhash} />
                ) : null}
              </div>
            ) : null}
            <img
              ref={(element) => {
                viewport.image.current = element;
                if (element?.complete && element.naturalWidth)
                  viewport.reportImage(
                    element.naturalWidth,
                    element.naturalHeight,
                  );
              }}
              src={src}
              alt={save.title ?? ""}
              className={styles.image}
              data-pending={!shown || undefined}
              decoding="async"
              fetchPriority={active ? "high" : "low"}
              style={{ ...imageStyle, display: gif.ready ? "none" : undefined }}
              draggable={mode === "view" && viewport.pose.zoom <= 1}
              onDragStart={(event) => {
                beginSaveDrag(save.id, event);
              }}
              onLoad={(event) =>
                viewport.reportImage(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                )
              }
              onError={onError}
            />
            {isGif ? (
              <GifContextMenu
                hasLoop={gif.loop !== null}
                onResetLoop={gif.resetLoop}
                onSetThumbnail={setGifThumbnail}
              >
                <canvas
                  ref={gif.canvas}
                  className={styles.image}
                  data-frame={gif.frameIndex}
                  data-pending={!shown || undefined}
                  style={{
                    ...imageStyle,
                    display: gif.ready ? "block" : "none",
                  }}
                  aria-label={`${save.title || "GIF"}, frame ${gif.frameIndex + 1}`}
                />
              </GifContextMenu>
            ) : null}
            <ImageOverlay draft={draft} mode={mode} />
          </div>
        </div>
        {showNavigator && viewport.size.width > 0 ? (
          <Navigator
            src={src}
            pose={viewport.pose}
            bounds={viewport.bounds}
            stage={{
              width: viewport.frame.current?.clientWidth ?? 1,
              height: viewport.frame.current?.clientHeight ?? 1,
            }}
            onPose={(next) => viewport.setPosition(() => next, true)}
          />
        ) : null}
      </div>
      <ImageControls.Hud
        actual={viewport.actual}
        active={active}
        busy={busy}
        canCrop={canApplyCrop}
        mode={mode}
        edits={edits}
        endActions={endActions}
        slideNavigation={slideNavigation}
        onSetImageThumbnail={
          canSetImageThumbnail ? setImageThumbnail : undefined
        }
        saveId={save.id}
        isGif={isGif}
        gifFramesOpen={gifFramesOpen}
        onActualSize={actualSize}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        onFit={() => viewport.setPosition(() => FIT_POSE)}
        onFlip={() =>
          void run(() =>
            applyInspect(save.id, flipPatch(save, "x"), "inspect:flip"),
          )
        }
        onRotate={() =>
          void run(() =>
            applyInspect(save.id, rotatePatch(save, 90), "inspect:rotate"),
          )
        }
        onSaveCrop={saveCrop}
        onToggleCrop={toggleCrop}
        onToggleGifFrames={() => setGifFramesOpen((value) => !value)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomRatio={setZoomRatio}
      />
      <ImageControls.Gif
        active={active && gifFramesOpen}
        gif={gif}
        mode={mode}
      />
    </div>
  );
}
