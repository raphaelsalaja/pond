import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewMedia, displayPreviewUrl } from "./preview-media";

function setup() {
  const image = document.createElement("img");
  const video = document.createElement("video");
  const error = document.createElement("div");
  const retry = document.createElement("button");
  video.pause = vi.fn();
  video.load = vi.fn();
  document.body.append(image, video, error, retry);
  return {
    image,
    video,
    error,
    retry,
    media: createPreviewMedia({ image, video, error, retry }),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("detached preview media lifecycle", () => {
  it("keeps playback when window configuration updates and releases it on target change", () => {
    const { media, video, image } = setup();
    const target = {
      title: "Video",
      url: "pond://save/movie.mp4",
      mediaType: "video" as const,
      source: "original" as const,
    };
    media.show(target);
    expect(video.hidden).toBe(false);
    expect(image.hidden).toBe(true);
    video.currentTime = 12;
    media.show({ ...target, title: "Renamed" });
    expect(video.currentTime).toBe(12);
    expect(video.pause).not.toHaveBeenCalled();
    media.show({
      title: "Image",
      url: "pond://save/image.png",
      mediaType: "image",
      source: "original",
    });
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.load).toHaveBeenCalledOnce();
    expect(video.hasAttribute("src")).toBe(false);
    expect(image.hidden).toBe(false);
    media.dispose();
  });

  it("applies the shared mute preference without changing volume", () => {
    const onMuted = vi.fn();
    const image = document.createElement("img");
    const video = document.createElement("video");
    const error = document.createElement("div");
    const retry = document.createElement("button");
    video.pause = vi.fn();
    video.load = vi.fn();
    let muted = false;
    Object.defineProperty(video, "muted", {
      configurable: true,
      get: () => muted,
      set(value: boolean) {
        muted = value;
        video.dispatchEvent(new Event("volumechange"));
      },
    });
    video.volume = 0.4;
    document.body.append(image, video, error, retry);
    const media = createPreviewMedia({
      image,
      video,
      error,
      retry,
      onMuted,
    });
    const target = {
      title: "Video",
      url: "pond://save/movie.mp4",
      mediaType: "video" as const,
      source: "original" as const,
    };

    media.show(target);
    media.setMuted(true);

    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.4);
    expect(onMuted).not.toHaveBeenCalled();

    video.muted = false;
    expect(onMuted).toHaveBeenCalledWith(false);
    expect(video.volume).toBe(0.4);

    onMuted.mockClear();
    media.show({ ...target, url: "pond://save/next.mp4" });
    media.setMuted(true);
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0.4);
    expect(onMuted).not.toHaveBeenCalled();
    media.dispose();
  });

  it("pauses and releases video when its window closes", () => {
    const { media, video } = setup();
    media.show({
      title: "Video",
      url: "pond://save/movie.mp4",
      mediaType: "video",
      source: "original",
    });
    media.dispose();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.hasAttribute("src")).toBe(false);
  });

  it("shows recoverable missing or unsupported media errors", () => {
    const { media, video, error, retry } = setup();
    media.show({
      title: "Video",
      url: "pond://save/movie.mp4",
      mediaType: "video",
      source: "original",
    });
    video.dispatchEvent(new Event("error"));
    expect(error.hidden).toBe(false);
    expect(video.hidden).toBe(true);
    retry.click();
    expect(error.hidden).toBe(true);
    expect(video.hidden).toBe(false);
    expect(video.load).toHaveBeenCalledOnce();
    video.dispatchEvent(new Event("error"));
    video.dispatchEvent(new Event("loadeddata"));
    expect(error.hidden).toBe(true);
    media.dispose();
  });

  it("uses generated display URLs without replacing original identity", () => {
    const original = "pond://save/photo.heic";
    expect(displayPreviewUrl({ url: original, source: "original" })).toBe(
      original,
    );
    expect(displayPreviewUrl({ url: original, source: "generated" })).toMatch(
      /^pond:\/\/save\/photo\.heic\?preview=2048&tv=/,
    );

    const { media, image } = setup();
    media.show({
      title: "HEIC",
      url: original,
      mediaType: "image",
      source: "generated",
    });
    expect(image.src).toContain("pond://save/photo.heic?preview=2048&tv=");
    media.dispose();
  });

  it("keeps a generated-preview failure visible and retryable", () => {
    const { error, image, media, retry } = setup();
    media.show({
      title: "RAW",
      url: "pond://save/capture.dng",
      mediaType: "image",
      source: "generated",
    });

    image.dispatchEvent(new Event("error"));
    expect(error.hidden).toBe(false);
    expect(image.hidden).toBe(true);
    retry.click();
    expect(error.hidden).toBe(true);
    expect(image.hidden).toBe(false);
    expect(image.src).toContain("pond://save/capture.dng?preview=2048&tv=");
    media.dispose();
  });
});
