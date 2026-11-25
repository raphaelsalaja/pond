import type { ImageCrop } from "@pond/schema/db";
import { isElement } from "@pond/ui/dom";
import { isStaticThumbnailFile } from "@shared/media-index";
import { pickCardFile } from "@shared/save-file-names";
import log from "electron-log/renderer";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import { useViewerChromeEnabled } from "@/features/saves/components/viewers/media-viewer/chrome";
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
import { mediaTransformStyle } from "@/features/saves/lib/media-transform";
import { buildOriginalMediaUnits } from "@/features/saves/lib/media/units";
import { pondFileUrl } from "@/features/saves/lib/media/url";
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
import { useImageGestures } from "./image-gestures";
import type { ImageDrag } from "./image-gestures";
import { Navigator } from "./navigator";
import { ImageOverlay } from "./overlay";
import type { InspectorMode } from "./types";
import { useCropKeyboard } from "./use-crop-keyboard";
import { useImageViewport } from "./use-image-viewport";
import styles from "./styles.module.css";

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
  measureFrame?: (frame: HTMLElement) => DOMRectReadOnly;
}

function readFrameRect(frame: HTMLElement): DOMRectReadOnly {
  return frame.getBoundingClientRect();
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
  measureFrame = readFrameRect,
}: ImageInspectorProps) {
  const [prefs] = usePrefs("viewer");
  /** Quick Preview hides the viewer chrome and uses browser-style click to zoom. */
  const quick = !useViewerChromeEnabled();
  const press = useRef<{ x: number; y: number } | null>(null);
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
  const dragRef = useRef<ImageDrag | null>(null);
  const lastNavigate = useRef(0);
  const gestureMovedRef = useRef(false);
  const pending = useRef(false);
  const gif = useGifPlayer(
    src,
    isGif,
    active && mode === "view",
    prefs.gifAutoplay !== false,
  );
  const {
    canvas: gifCanvasRef,
    frameIndex: gifFrameIndex,
    loop: gifLoop,
    ready: gifReady,
    resetLoop: resetGifLoop,
  } = gif;
  const navigate = (delta: number) => {
    if (!onNavigate || Date.now() - lastNavigate.current < 200) return;
    lastNavigate.current = Date.now();
    void resultNavigation
      .next(save.id, delta)
      .then((next) => {
        if (next) onNavigate(next);
      })
      .catch((cause: unknown) => {
        log.warn("[pond viewer] finding the next save failed", cause);
      });
  };
  const {
    actual: viewActual,
    bounds: viewBounds,
    frame: frameRef,
    image: imageRef,
    live: viewLive,
    oneToOne,
    pointFromClient,
    pose: viewPose,
    ratio: imageRatio,
    reportImage,
    setPosition,
    size: viewSize,
  } = useImageViewport({
    active,
    defaultSize: prefs.defaultImageSize,
    initialRatio:
      file?.width && file.height
        ? file.width / file.height
        : save.width && save.height
          ? save.width / save.height
          : null,
    isDragging: () => dragRef.current !== null,
    measureFrame,
    mode,
    naturalWidth: file?.width || save.width || 0,
    onNavigate: navigate,
    onRatio,
    rememberPosition: prefs.rememberImagePosition !== false,
    src,
    staticAtFit: quick,
    wheelBehavior: prefs.wheelBehavior,
  });
  const decoded = useImageDecoded(imageRef, src);
  const thumbnail = cardThumbnailFor(src);
  const cardFile = pickCardFile(save.files);
  /** `save.blurhash` encodes the card's still, so it only stands in for that same file. */
  const blurhash =
    cardFile && cardFile.path === file?.path && isStaticThumbnailFile(cardFile)
      ? save.blurhash
      : null;
  const shown = useMediaReveal(decoded || gifReady, src);
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
    setPosition(() => FIT_POSE);
  };
  const actualSize = () => {
    const one = oneToOne;
    if (one) {
      setPosition(() => ({
        zoom: Math.min(32, one),
        x: 0,
        y: 0,
      }));
    }
  };
  const zoomOut = () =>
    setPosition((previous) =>
      zoomImageAt(previous, previous.zoom / 1.25, { x: 0, y: 0 }),
    );
  const zoomIn = () =>
    setPosition((previous) =>
      zoomImageAt(previous, previous.zoom * 1.25, { x: 0, y: 0 }),
    );
  const setZoomRatio = (ratio: number) => {
    const one = oneToOne;
    if (!one) {
      return;
    }
    setPosition((previous) =>
      zoomImageAt(previous, Math.min(32, ratio * one), { x: 0, y: 0 }),
    );
  };
  const setGifThumbnail = () => {
    void window.pond
      .query("saves.setGifThumbnail", {
        id: save.id,
        src,
        frameIndex: gifFrameIndex,
      })
      .then((result) => {
        if (!result.ok) {
          notify({
            id: "gif-thumb",
            title: "Couldn't set this GIF frame as the thumbnail.",
          });
        }
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
        if (!result.ok) {
          notify({
            id: "image-thumb",
            title: "Couldn't set this image as the thumbnail.",
          });
        }
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
    frame: frameRef,
    mode,
    onApply: applyCrop,
    ratio: imageRatio,
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
        frameIndex: isGif ? gifFrameIndex : undefined,
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
      frameRef.current?.focus();
      return;
    }
    const focusLost =
      !document.activeElement || document.activeElement === document.body;
    /** The crop bar unmounts with its focused button; return focus to the image instead of body. */
    if (leftMode && focusLost) {
      frameRef.current?.focus({ preventScroll: true });
    }
  }, [active, mode, frameRef]);
  const gestures = useImageGestures({
    active,
    draft,
    dragRef,
    gestureMovedRef,
    mode,
    onNavigate: navigate,
    pointFromClient,
    poseZoom: viewPose.zoom,
    ratio: imageRatio,
    setDraft,
    setPosition,
  });

  return (
    <div
      className={styles.root}
      data-active={active || undefined}
      data-gif-player={gifReady || undefined}
    >
      <span id={instructionsId} className={styles.instructions}>
        {mode === "crop"
          ? "Crop. Edges and centers snap to guides. Arrow keys move the selection, Control or Command and arrow keys resize, Shift increases the step. Enter applies the crop. Escape cancels."
          : "Arrow keys pan. Plus and minus zoom."}
      </span>
      <div
        ref={frameRef}
        className={styles.frame}
        role="application"
        aria-label="Image"
        aria-describedby={instructionsId}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard users pan and zoom the image from this frame
        tabIndex={active ? 0 : -1}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            event.nativeEvent.isComposing
          ) {
            return;
          }
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          /** At fit, Quick Preview leaves arrow keys to step between items and Saves. */
          const stepping = quick && !!direction && viewPose.zoom <= 1;
          if (
            mode === "view" &&
            !stepping &&
            (direction || ["+", "=", "-"].includes(event.key))
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (direction) {
              setPosition((previous) => ({
                ...previous,
                x:
                  previous.x -
                  (direction[0] ?? 0) * (event.shiftKey ? 100 : 20),
                y:
                  previous.y -
                  (direction[1] ?? 0) * (event.shiftKey ? 100 : 20),
              }));
            } else if (event.key === "-") {
              zoomOut();
            } else {
              zoomIn();
            }
          }
        }}
        data-background={prefs.transparentBackground ?? "none"}
        data-mode={mode}
        data-click-zoom={
          quick && mode === "view"
            ? viewPose.zoom > 1
              ? "out"
              : "in"
            : undefined
        }
        {...gestures}
        onPointerDownCapture={(event) => {
          press.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={
          quick
            ? (event) => {
                const start = press.current;
                press.current = null;
                if (mode !== "view" || event.button !== 0) {
                  return;
                }
                if (isElement(event.target) && event.target.closest("button")) {
                  return;
                }
                if (
                  start &&
                  Math.abs(event.clientX - start.x) +
                    Math.abs(event.clientY - start.y) >
                    4
                ) {
                  return;
                }
                if (viewPose.zoom > 1) {
                  setPosition(() => FIT_POSE);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setPosition((previous) =>
                  zoomImageAt(
                    previous,
                    Math.min(32, Math.max(2, oneToOne ?? 0)),
                    {
                      x: event.clientX - rect.left - rect.width / 2,
                      y: event.clientY - rect.top - rect.height / 2,
                    },
                  ),
                );
              }
            : undefined
        }
      >
        <div
          className={styles.position}
          data-live={viewLive || undefined}
          style={{
            transform: `translate(${viewPose.x}px, ${viewPose.y}px) scale(${viewPose.zoom})`,
          }}
        >
          <div
            className={styles.content}
            style={
              viewSize.width && viewSize.height
                ? {
                    left: viewBounds.left,
                    top: viewBounds.top,
                    width: viewBounds.width,
                    height: viewBounds.height,
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
                imageRef.current = element;
                if (element?.complete && element.naturalWidth) {
                  reportImage(element.naturalWidth, element.naturalHeight);
                }
              }}
              src={src}
              alt={save.title ?? ""}
              className={styles.image}
              data-pending={!shown || undefined}
              decoding="async"
              fetchPriority={active ? "high" : "low"}
              style={{ ...imageStyle, display: gifReady ? "none" : undefined }}
              draggable={mode === "view" && viewPose.zoom <= 1}
              onDragStart={(event) => {
                beginSaveDrag(save.id, event);
              }}
              onLoad={(event) =>
                reportImage(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                )
              }
              onError={onError}
            />
            {isGif ? (
              <GifContextMenu
                hasLoop={gifLoop !== null}
                onResetLoop={resetGifLoop}
                onSetThumbnail={setGifThumbnail}
              >
                <canvas
                  ref={gifCanvasRef}
                  className={styles.image}
                  data-frame={gifFrameIndex}
                  data-pending={!shown || undefined}
                  style={{
                    ...imageStyle,
                    display: gifReady ? "block" : "none",
                  }}
                  aria-label={`${save.title || "GIF"}, frame ${gifFrameIndex + 1}`}
                />
              </GifContextMenu>
            ) : null}
            <ImageOverlay draft={draft} mode={mode} />
          </div>
        </div>
        {showNavigator && viewSize.width > 0 ? (
          <Navigator
            src={src}
            pose={viewPose}
            bounds={viewBounds}
            stage={{
              width: viewSize.width,
              height: viewSize.height,
            }}
            onPose={(next) => setPosition(() => next, true)}
          />
        ) : null}
      </div>
      <ImageControls.Hud
        actual={viewActual}
        active={active}
        busy={busy}
        canCrop={canApplyCrop}
        mode={mode}
        edits={edits}
        endActions={endActions}
        onSetImageThumbnail={
          canSetImageThumbnail ? setImageThumbnail : undefined
        }
        saveId={save.id}
        isGif={isGif}
        gifFramesOpen={gifFramesOpen}
        onActualSize={actualSize}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        onFit={() => setPosition(() => FIT_POSE)}
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
