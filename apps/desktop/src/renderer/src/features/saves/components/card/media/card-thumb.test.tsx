import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import { loadPrefs } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
import { CardThumb } from "./";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  bridge.use({
    machinePace: async () => ({ thermal: "nominal", onBattery: false }),
    query: {
      "settings.getPrefs": () =>
        PrefsSchema.parse({
          viewer: { hoverVideo: true, thumbnailBehavior: "scrub" },
          preferences: { tweetCover: "screenshot" },
        }),
    },
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function file(
  kind: string,
  path: string,
  mimeType: string,
  sha256 = "abcdef1234567890",
): SaveFile {
  return { kind, path, mimeType, sha256, size: 10 };
}

function makeSave(partial: Partial<Save> & { id: string }): Save {
  return {
    source: "instagram",
    sourceId: partial.id,
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "video",
    files: [],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...partial,
  };
}

async function renderCard(save: Save): Promise<void> {
  await loadPrefs();
  container = document.createElement("div");
  container.tabIndex = -1;
  document.body.append(container);
  container.focus();
  root = createRoot(container);
  await act(async () => {
    root?.render(<CardThumb save={save} view="grid" />);
  });
}

function videos(): NodeListOf<HTMLVideoElement> {
  if (!container) throw new Error("Missing container");
  return container.querySelectorAll("video");
}

function images(): NodeListOf<HTMLImageElement> {
  if (!container) throw new Error("Missing container");
  return container.querySelectorAll("img");
}

describe("CardThumb hover video eligibility", () => {
  it("mounts hover playback for a reel whose card still is the generated media thumbnail", async () => {
    const save = makeSave({
      id: "reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);

    expect(videos()).toHaveLength(1);
    expect(images()).toHaveLength(1);
    expect(images()[0]?.getAttribute("src")).toContain(
      "video-1.mp4_thumbnail.webp",
    );
  });

  it("keeps the video lazy while the thumbnail paints the resting card", async () => {
    const save = makeSave({
      id: "lazy-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);

    const video = videos()[0];
    expect(video?.hasAttribute("src")).toBe(false);
    expect(video?.preload).toBe("none");
  });

  it("loads and plays the video when the pointer rests on the card", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const save = makeSave({
      id: "hovered-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);
    const video = videos()[0];
    if (!video) throw new Error("Missing hover video");
    await act(async () => {
      await Promise.resolve();
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(async () => {
      video.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.runOnlyPendingTimers();
    });

    expect(video.getAttribute("src")).toContain("video-1.mp4");
    expect(play).toHaveBeenCalled();
  });

  it("mounts hover playback for an Instagram cover and video shape", async () => {
    const save = makeSave({
      id: "cover-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("image", "media-1.jpg", "image/jpeg"),
      ],
    });

    await renderCard(save);

    expect(videos()).toHaveLength(1);
  });

  it("keeps the X post screenshot as the resting card while the video hover-plays", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const save = makeSave({
      id: "tweet",
      source: "twitter",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("tweet_screenshot_light", "tweet-light.png", "image/png"),
      ],
    });

    await renderCard(save);

    expect(images()).toHaveLength(1);
    expect(images()[0]?.getAttribute("src")).toContain("tweet-light.png");
    const video = videos()[0];
    if (!video) throw new Error("Missing hover video");
    expect(video.hasAttribute("src")).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(async () => {
      video.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.runOnlyPendingTimers();
    });

    expect(video.getAttribute("src")).toContain("video-1.mp4");
    expect(play).toHaveBeenCalled();
  });

  it("keeps a poster-only save static", async () => {
    const save = makeSave({
      id: "poster-only",
      source: "youtube",
      files: [
        file("poster", "poster.jpg", "image/jpeg"),
        file("thumbnail", "poster.jpg_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);

    expect(videos()).toHaveLength(0);
    expect(images().length).toBeGreaterThan(0);
  });

  it("keeps a save static when the video format is not browser-renderable", async () => {
    const save = makeSave({
      id: "mpeg",
      source: "local",
      files: [
        file("video", "movie.mpeg", "video/mpeg"),
        file("thumbnail", "movie.mpeg_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);

    expect(videos()).toHaveLength(0);
  });

  it("keeps the thumbnail card when the hover video fails to load", async () => {
    const save = makeSave({
      id: "broken-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);
    const video = videos()[0];
    if (!video) throw new Error("Missing hover video");

    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });

    expect(videos()).toHaveLength(0);
    expect(images()).toHaveLength(1);
    expect(images()[0]?.getAttribute("src")).toContain(
      "video-1.mp4_thumbnail.webp",
    );
  });

  it("mounts the hover video again when a replaced file changes its URL", async () => {
    const save = makeSave({
      id: "replaced-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });

    await renderCard(save);
    const video = videos()[0];
    if (!video) throw new Error("Missing hover video");
    await act(async () => {
      video.dispatchEvent(new Event("error"));
    });
    expect(videos()).toHaveLength(0);

    const replaced = makeSave({
      id: "replaced-reel",
      files: [
        file("video", "video-1.mp4", "video/mp4", "fedcba0987654321"),
        file("poster", "poster-1.jpg", "image/jpeg"),
        file("thumbnail", "video-1.mp4_thumbnail.webp", "image/webp"),
      ],
    });
    if (!root) throw new Error("Missing root");
    await act(async () => {
      root?.render(<CardThumb save={replaced} view="grid" />);
    });

    expect(videos()).toHaveLength(1);
  });
});
