import type { PreviewWindowState } from "../../shared/preview-window-contracts";
import { previewUrlFor } from "./features/saves/lib/media/url";

interface PreviewMediaElements {
  image: HTMLImageElement;
  video: HTMLVideoElement;
  error: HTMLElement;
  retry: HTMLButtonElement;
  /** Native controls write `muted` on the element. Volume is left unchanged. */
  onMuted?: (muted: boolean) => void;
}

type PreviewMediaTarget = Pick<
  PreviewWindowState,
  "url" | "mediaType" | "source" | "title"
>;

export function displayPreviewUrl(
  target: Pick<PreviewWindowState, "url" | "source">,
): string {
  return target.source === "generated" ? previewUrlFor(target.url) : target.url;
}

export function createPreviewMedia({
  image,
  video,
  error,
  retry,
  onMuted,
}: PreviewMediaElements) {
  let current: (PreviewMediaTarget & { displayUrl: string }) | null = null;
  let applyingMute = false;
  const setMuted = (muted: boolean) => {
    if (video.muted === muted) return;
    applyingMute = true;
    video.muted = muted;
    applyingMute = false;
  };
  const onVolumeChange = () => {
    if (applyingMute) return;
    onMuted?.(video.muted);
  };
  const clearVideo = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
  const failed = () => {
    image.hidden = true;
    video.hidden = true;
    error.hidden = false;
  };
  const loaded = () => {
    error.hidden = true;
    if (!current) return;
    image.hidden = current.mediaType === "video";
    video.hidden = current.mediaType !== "video";
  };
  const reload = () => {
    if (!current) return;
    error.hidden = true;
    const isVideo = current.mediaType === "video";
    image.hidden = isVideo;
    video.hidden = !isVideo;
    if (isVideo) video.load();
    else image.src = current.displayUrl;
  };
  image.addEventListener("error", failed);
  image.addEventListener("load", loaded);
  video.addEventListener("error", failed);
  video.addEventListener("loadeddata", loaded);
  video.addEventListener("volumechange", onVolumeChange);
  retry.addEventListener("click", reload);
  return {
    setMuted,
    show(next: PreviewMediaTarget) {
      const displayUrl = displayPreviewUrl(next);
      const changed =
        current?.displayUrl !== displayUrl ||
        current?.mediaType !== next.mediaType;
      if (changed && current?.mediaType === "video") clearVideo();
      current = { ...next, displayUrl };
      const isVideo = next.mediaType === "video";
      image.hidden = isVideo;
      video.hidden = !isVideo;
      image.alt = next.title;
      video.ariaLabel = next.title;
      if (!changed) return;
      error.hidden = true;
      if (isVideo) {
        image.removeAttribute("src");
        video.src = displayUrl;
      } else image.src = displayUrl;
    },
    dispose() {
      image.removeEventListener("error", failed);
      image.removeEventListener("load", loaded);
      video.removeEventListener("error", failed);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("volumechange", onVolumeChange);
      retry.removeEventListener("click", reload);
      if (current?.mediaType === "video") clearVideo();
      current = null;
    },
  };
}
