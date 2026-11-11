import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { PondPreviewApi } from "../../preload/preview";
import type { PreviewWindowState } from "../../shared/preview-window-contracts";
import "./app/boot-shell";
import {
  type PreviewControlActions,
  PreviewControls,
} from "./preview-controls";
import { createPreviewMedia } from "./preview-media";
import "./preview.css";

declare global {
  interface Window {
    pondPreview: PondPreviewApi;
  }
}

const image = document.querySelector<HTMLImageElement>("#image");
const preview = document.querySelector<HTMLElement>("#preview");
const video = document.querySelector<HTMLVideoElement>("#video");
const error = document.querySelector<HTMLElement>("#media-error");
const retry = document.querySelector<HTMLButtonElement>("#retry");
const previewUi = document.querySelector<HTMLElement>("#preview-ui");
if (!image || !preview || !video || !error || !retry || !previewUi)
  throw new Error("Preview surface is missing.");

const uiRoot = createRoot(previewUi);

let state: PreviewWindowState | null = null;
let slideshow = false;
let slideshowTimer: ReturnType<typeof setInterval> | null = null;

const NEXT_ROTATION = {
  0: 90,
  90: 180,
  180: 270,
  270: 0,
} satisfies Record<
  PreviewWindowState["rotation"],
  PreviewWindowState["rotation"]
>;

function configure(
  patch: Omit<Parameters<PondPreviewApi["configure"]>[0], "windowId">,
): void {
  if (!state) return;
  void window.pondPreview.configure({ windowId: state.windowId, ...patch });
}

function requestNeighbor(delta: -1 | 1): void {
  if (!state) return;
  void window.pondPreview.requestNeighbor({
    windowId: state.windowId,
    saveId: state.saveId,
    delta,
    kind: state.kind,
  });
}

function runFileAction(action: "open" | "export"): void {
  if (!state) return;
  void window.pondPreview.fileAction({ windowId: state.windowId, action });
}

const actions: PreviewControlActions = {
  close: () => {
    if (state) void window.pondPreview.close(state.windowId);
  },
  cycleOpacity: () => {
    if (!state) return;
    configure({ opacity: state.opacity <= 0.4 ? 1 : state.opacity - 0.2 });
  },
  next: () => requestNeighbor(1),
  openOriginal: () => runFileAction("open"),
  previous: () => requestNeighbor(-1),
  toggleFullscreen: () => configure({ fullscreen: !state?.fullscreen }),
  toggleGrayscale: () => configure({ grayscale: !state?.grayscale }),
  toggleMirror: () => configure({ mirrored: !state?.mirrored }),
  togglePin: () => configure({ alwaysOnTop: !state?.alwaysOnTop }),
  toggleSize: () => {
    if (state?.mediaType === "video") {
      configure({ size: state.size === "fill" ? "fit" : "fill" });
      return;
    }
    configure({ zoom: state?.zoom === null ? 1 : null });
  },
  toggleSlideshow: () => {
    slideshow = !slideshow;
    refreshSlideshow();
  },
  rotate: () => {
    if (state?.mediaType !== "image") return;
    configure({ rotation: NEXT_ROTATION[state.rotation] });
  },
  exportOriginal: () => runFileAction("export"),
};

function renderPreviewUi(): void {
  if (!state) return;
  uiRoot.render(createElement(PreviewControls, { actions, slideshow, state }));
}

function refreshImageSize(): void {
  if (!state || !image) return;
  image.dataset.size = state.zoom === null ? "fit" : "actual";
  image.style.width =
    state.zoom !== null && image.naturalWidth
      ? `${image.naturalWidth * state.zoom}px`
      : "";
  image.style.height = "auto";
}

function refreshVideoSize(): void {
  if (!state || !video) return;
  video.dataset.size = state.size === "fill" ? "fill" : "fit";
}

function refreshSlideshow(): void {
  if (slideshowTimer) clearInterval(slideshowTimer);
  slideshowTimer = null;
  if (slideshow && state?.kind === "presentation" && !document.hidden) {
    slideshowTimer = setInterval(() => requestNeighbor(1), 5000);
  }
  renderPreviewUi();
}

const media = createPreviewMedia({
  image,
  video,
  error,
  retry,
  onMuted(muted) {
    if (state?.mediaType !== "video" || state.videoMuted === muted) return;
    configure({ videoMuted: muted });
  },
});

const unsubscribe = window.pondPreview.onState((next) => {
  state = next;
  const title = `${next.title} · Pond`;
  document.title = title;
  media.show(next);
  if (next.mediaType === "video") media.setMuted(next.videoMuted);
  preview.dataset.mediaType = next.mediaType;
  document.body.dataset.mediaType = next.mediaType;
  document.body.dataset.reduceMotion = next.reduceMotion;
  image.style.transform = `rotate(${next.rotation}deg) scaleX(${next.mirrored ? -1 : 1})`;
  image.style.filter = next.grayscale ? "grayscale(1)" : "";
  refreshImageSize();
  refreshVideoSize();
  refreshSlideshow();
});
document.addEventListener("visibilitychange", refreshSlideshow);
image.addEventListener("load", refreshImageSize);

window.addEventListener("keydown", (event) => {
  if (
    state?.mediaType === "image" &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    requestNeighbor(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (event.key === "Escape" && state && !document.fullscreenElement) {
    if (state.fullscreen) configure({ fullscreen: false });
    else void window.pondPreview.close(state.windowId);
  }
});

window.addEventListener("beforeunload", () => {
  unsubscribe();
  if (slideshowTimer) clearInterval(slideshowTimer);
  media.dispose();
  uiRoot.unmount();
});
