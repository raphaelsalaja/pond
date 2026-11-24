import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowsExpandDiagonal,
  IconContrast,
  IconFileExport,
  IconFlipHorizontal2,
  IconFullScreen,
  IconMediaPause,
  IconMediaPlay,
  IconPinTack,
  IconRotateImageClockwise,
  IconSizeLg,
  IconWindowShare,
} from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import type { ReactElement } from "react";
import type { PreviewWindowState } from "../../shared/preview-window-contracts";
import { FramelessWindowChrome } from "./shared/components/frameless-window-chrome";

export interface PreviewControlActions {
  close: () => void;
  cycleOpacity: () => void;
  next: () => void;
  openOriginal: () => void;
  previous: () => void;
  toggleFullscreen: () => void;
  toggleGrayscale: () => void;
  toggleMirror: () => void;
  togglePin: () => void;
  toggleSize: () => void;
  toggleSlideshow: () => void;
  rotate: () => void;
  exportOriginal: () => void;
}

interface PreviewToolProps {
  children: ReactElement;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  side: "top" | "bottom";
}

function PreviewTool({
  children,
  label,
  onClick,
  pressed,
  side,
}: PreviewToolProps) {
  return (
    <Tooltip label={label} side={side}>
      <Button
        aria-label={label}
        aria-pressed={pressed}
        icon
        onClick={onClick}
        size="sm"
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function PreviewControls({
  actions,
  slideshow,
  state,
}: {
  actions: PreviewControlActions;
  slideshow: boolean;
  state: PreviewWindowState;
}) {
  const tooltipSide = state.mediaType === "video" ? "bottom" : "top";

  return (
    <Tooltip.Provider>
      <div className="preview-window-chrome">
        <FramelessWindowChrome
          closeLabel={"Close Preview"}
          onClose={actions.close}
        />
      </div>
      <Tooltip.Group>
        <nav aria-label={"Preview Controls"} className="preview-controls">
          <div className="preview-control-group">
            <PreviewTool
              label={"Previous"}
              onClick={actions.previous}
              side={tooltipSide}
            >
              <IconArrowLeft />
            </PreviewTool>
            <PreviewTool
              label={"Next"}
              onClick={actions.next}
              side={tooltipSide}
            >
              <IconArrowRight />
            </PreviewTool>
            {state.kind === "presentation" ? (
              <PreviewTool
                label={slideshow ? "Pause Slideshow" : "Play Slideshow"}
                onClick={actions.toggleSlideshow}
                pressed={slideshow}
                side={tooltipSide}
              >
                {slideshow ? <IconMediaPause /> : <IconMediaPlay />}
              </PreviewTool>
            ) : null}
          </div>

          {state.mediaType === "image" ? (
            <div className="preview-control-group">
              <PreviewTool
                label={"Rotate"}
                onClick={actions.rotate}
                side={tooltipSide}
              >
                <IconRotateImageClockwise />
              </PreviewTool>
              <PreviewTool
                label={"Mirror"}
                onClick={actions.toggleMirror}
                pressed={state.mirrored}
                side={tooltipSide}
              >
                <IconFlipHorizontal2 />
              </PreviewTool>
              <PreviewTool
                label={"Grayscale"}
                onClick={actions.toggleGrayscale}
                pressed={state.grayscale}
                side={tooltipSide}
              >
                <IconContrast />
              </PreviewTool>
              <PreviewTool
                label={state.zoom === null ? "Actual Size" : "Fit"}
                onClick={actions.toggleSize}
                pressed={state.zoom !== null}
                side={tooltipSide}
              >
                {state.zoom === null ? (
                  <IconSizeLg />
                ) : (
                  <IconArrowsExpandDiagonal />
                )}
              </PreviewTool>
            </div>
          ) : (
            <div className="preview-control-group">
              <PreviewTool
                label={state.size === "fill" ? "Fit" : "Fill"}
                onClick={actions.toggleSize}
                pressed={state.size === "fill"}
                side={tooltipSide}
              >
                <IconArrowsExpandDiagonal />
              </PreviewTool>
            </div>
          )}

          <div className="preview-control-group">
            <PreviewTool
              label={"Open in Default App"}
              onClick={actions.openOriginal}
              side={tooltipSide}
            >
              <IconWindowShare />
            </PreviewTool>
            <PreviewTool
              label={"Export Original"}
              onClick={actions.exportOriginal}
              side={tooltipSide}
            >
              <IconFileExport />
            </PreviewTool>
          </div>

          <div className="preview-control-group">
            <PreviewTool
              label={"Fullscreen"}
              onClick={actions.toggleFullscreen}
              pressed={state.fullscreen}
              side={tooltipSide}
            >
              <IconFullScreen />
            </PreviewTool>
            <Tooltip
              label={`${"Opacity"}: ${Math.round(state.opacity * 100)}%`}
              side={tooltipSide}
            >
              <Button
                aria-label={`${"Opacity"}: ${Math.round(state.opacity * 100)}%`}
                className="preview-opacity"
                onClick={actions.cycleOpacity}
                size="sm"
                type="button"
                variant="ghost"
              >
                {Math.round(state.opacity * 100)}%
              </Button>
            </Tooltip>
            <PreviewTool
              label={"Keep on Top"}
              onClick={actions.togglePin}
              pressed={state.alwaysOnTop}
              side={tooltipSide}
            >
              <IconPinTack />
            </PreviewTool>
          </div>
        </nav>
      </Tooltip.Group>
    </Tooltip.Provider>
  );
}
