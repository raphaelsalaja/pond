import {
  IconAnimationFrames,
  IconCheck,
  IconCrop,
  IconExpand,
  IconFlipHorizontal2,
  IconImagePlus,
  IconMediaFastBackwards,
  IconMediaFastForward,
  IconMediaPause,
  IconMediaPlay,
  IconRefresh,
  IconRotateImageClockwise,
  IconSizeLg,
  IconXmark,
} from "@pond/icons";
import { stepPlaybackRate } from "@pond/ui";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { ReactNode } from "react";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ChromePortal } from "@/features/saves/components/viewers/media-viewer/chrome";
import { ViewerSaveNav } from "@/features/saves/components/viewers/viewer-save-nav";
import {
  type ViewerNavigation,
  ViewerNavigationControls,
  ViewerToolbarGroups,
} from "@/features/saves/components/viewers/viewer-toolbar-groups";
import type { useGifPlayer } from "@/features/saves/hooks/use-gif-player";
import { clampGifFrame } from "@/features/saves/lib/gif-loop";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import type { InspectorMode } from "../types";
import { ZoomPill } from "../zoom-pill";
import styles from "./styles.module.css";

type GifPlayer = ReturnType<typeof useGifPlayer>;

interface HudProps {
  actual: number;
  active: boolean;
  busy: boolean;
  canCrop: boolean;
  saveId: string;
  isGif?: boolean;
  gifFramesOpen?: boolean;
  mode: InspectorMode;
  edits?: "full" | "none";
  endActions?: ReactNode;
  slideNavigation?: ViewerNavigation;
  onSetImageThumbnail?: () => void;
  onActualSize: () => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onFit: () => void;
  onFlip: () => void;
  onRotate: () => void;
  onSaveCrop: () => void;
  onToggleCrop: () => void;
  onToggleGifFrames?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomRatio: (ratio: number) => void;
}

function Hud({
  actual,
  active,
  busy,
  canCrop,
  saveId,
  isGif = false,
  gifFramesOpen = false,
  mode,
  edits = "full",
  endActions,
  slideNavigation,
  onSetImageThumbnail,
  onActualSize,
  onApplyCrop,
  onCancelCrop,
  onFit,
  onFlip,
  onRotate,
  onSaveCrop,
  onToggleCrop,
  onToggleGifFrames,
  onZoomIn,
  onZoomOut,
  onZoomRatio,
}: HudProps) {
  const shortcuts = useShortcutBindings();
  useHotkey(bindingKeys(shortcuts, "viewer.zoom-fit"), onFit, {
    enabled: active && mode === "view",
    ignoreInputs: true,
  });
  useHotkey(bindingKeys(shortcuts, "viewer.actual-size"), onActualSize, {
    enabled: active && mode === "view",
    ignoreInputs: true,
  });

  if (!active) return null;
  if (mode === "crop" && edits === "full")
    return (
      <ChromePortal slot="top">
        <ViewerHud.Bar
          key="crop"
          className={styles["mode-bar"]}
          data-mode="crop"
          label="Crop"
          end={
            <ViewerHud.Tools
              tooltipSide="bottom"
              role="group"
              aria-label="Crop Actions"
            >
              <ViewerHud.Tool
                label="Apply Crop"
                disabled={busy || !canCrop}
                onClick={onApplyCrop}
              >
                <IconCheck />
              </ViewerHud.Tool>
              <ViewerHud.Tool
                label="Save as New Image"
                disabled={busy || !canCrop}
                onClick={onSaveCrop}
              >
                <IconImagePlus />
              </ViewerHud.Tool>
              <ViewerHud.Tool
                label="Cancel"
                disabled={busy}
                onClick={onCancelCrop}
              >
                <IconXmark />
              </ViewerHud.Tool>
            </ViewerHud.Tools>
          }
        />
      </ChromePortal>
    );

  return (
    <>
      <ChromePortal slot="bottom">
        <ViewerHud.Pill className={styles.zoom}>
          <ZoomPill
            actual={actual}
            onOut={onZoomOut}
            onIn={onZoomIn}
            onRatio={onZoomRatio}
          />
        </ViewerHud.Pill>
      </ChromePortal>
      <ChromePortal slot="top">
        <ViewerHud.Bar
          key="view"
          className={styles["mode-bar"]}
          data-mode="view"
          label="Image"
          start={<ViewerSaveNav saveId={saveId} />}
          center={
            <ViewerToolbarGroups
              actions={
                <>
                  {onSetImageThumbnail ? (
                    <ViewerHud.Tool
                      label="Set Current Image as Thumbnail"
                      disabled={busy}
                      onClick={onSetImageThumbnail}
                    >
                      <IconImagePlus />
                    </ViewerHud.Tool>
                  ) : null}
                  {endActions}
                </>
              }
              edits={
                edits === "full" ? (
                  <>
                    <ViewerHud.Tool
                      label="Flip"
                      disabled={busy}
                      onClick={onFlip}
                    >
                      <IconFlipHorizontal2 />
                    </ViewerHud.Tool>
                    <ViewerHud.Tool
                      label="Rotate"
                      disabled={busy}
                      onClick={onRotate}
                    >
                      <IconRotateImageClockwise />
                    </ViewerHud.Tool>
                    <ViewerHud.Tool label="Crop" onClick={onToggleCrop}>
                      <IconCrop />
                    </ViewerHud.Tool>
                  </>
                ) : null
              }
              view={
                <>
                  <ViewerHud.Tool
                    label="Actual Size"
                    shortcut={<ShortcutKeys id="viewer.actual-size" />}
                    onClick={onActualSize}
                  >
                    <IconSizeLg />
                  </ViewerHud.Tool>
                  <ViewerHud.Tool
                    label="Fit to Window"
                    shortcut={<ShortcutKeys id="viewer.zoom-fit" />}
                    onClick={onFit}
                  >
                    <IconExpand />
                  </ViewerHud.Tool>
                  {isGif && onToggleGifFrames ? (
                    <ViewerHud.Tool
                      label="GIF Frames"
                      pressed={gifFramesOpen}
                      onClick={onToggleGifFrames}
                    >
                      <IconAnimationFrames />
                    </ViewerHud.Tool>
                  ) : null}
                </>
              }
            />
          }
          end={<ViewerNavigationControls navigation={slideNavigation} />}
        />
      </ChromePortal>
    </>
  );
}

interface GifProps {
  active: boolean;
  gif: GifPlayer;
  mode: InspectorMode;
}

function Gif({ active, gif, mode }: GifProps) {
  const shortcuts = useShortcutBindings();
  const hotkeys = {
    enabled: active && gif.ready && mode === "view",
    ignoreInputs: true,
  };
  useHotkey(bindingKeys(shortcuts, "viewer.play-pause"), gif.toggle, hotkeys);
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-prev"),
    () => gif.seek(gif.frameIndex - 1),
    hotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-next"),
    () => gif.seek(gif.frameIndex + 1),
    hotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-prev-ten"),
    () => gif.seek(gif.frameIndex - 10),
    hotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-next-ten"),
    () => gif.seek(gif.frameIndex + 10),
    hotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.speed-up"),
    () => gif.setRate(stepPlaybackRate(gif.rate, 1)),
    hotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.speed-down"),
    () => gif.setRate(stepPlaybackRate(gif.rate, -1)),
    hotkeys,
  );

  if (!active || !gif.ready || mode !== "view") return null;
  const loopStart = clampGifFrame(gif.loop?.[0] ?? 0, gif.frameCount, gif.loop);
  const loopEnd = clampGifFrame(
    gif.loop?.[1] ?? gif.frameCount - 1,
    gif.frameCount,
    gif.loop,
  );

  return (
    <ChromePortal slot="bottom">
      <ViewerHud.Tools
        tooltipSide="top"
        className={styles.gif}
        role="toolbar"
        aria-label="GIF Controls"
      >
        <ViewerHud.Tool
          label={gif.playing ? "Pause GIF" : "Play GIF"}
          onClick={gif.toggle}
        >
          {gif.playing ? <IconMediaPause /> : <IconMediaPlay />}
        </ViewerHud.Tool>
        <ViewerHud.Tool
          label="Previous Frame"
          disabled={gif.frameIndex <= loopStart}
          onClick={() => gif.seek(gif.frameIndex - 1)}
        >
          <IconMediaFastBackwards />
        </ViewerHud.Tool>
        <ViewerHud.Scale>
          {gif.frameIndex + 1} / {gif.frameCount} · {gif.rate}×
        </ViewerHud.Scale>
        <ViewerHud.Tool
          label="Next Frame"
          disabled={gif.frameIndex >= loopEnd}
          onClick={() => gif.seek(gif.frameIndex + 1)}
        >
          <IconMediaFastForward />
        </ViewerHud.Tool>
        <ViewerHud.Tool label="Set Loop Start" onClick={gif.setLoopStart}>
          <IconMediaFastBackwards />
        </ViewerHud.Tool>
        <ViewerHud.Tool label="Set Loop End" onClick={gif.setLoopEnd}>
          <IconMediaFastForward />
        </ViewerHud.Tool>
        <ViewerHud.Tool
          label="Reset Loop Range"
          disabled={!gif.loop}
          onClick={gif.resetLoop}
        >
          <IconRefresh />
        </ViewerHud.Tool>
      </ViewerHud.Tools>
    </ChromePortal>
  );
}

export const ImageControls = { Gif, Hud };
