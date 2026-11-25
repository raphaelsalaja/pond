import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPrefs } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
import { HoverVideo } from "./";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    machinePace: async () => ({ thermal: "nominal", onBattery: false }),
    query: {
      "settings.getPrefs": () =>
        PrefsSchema.parse({
          viewer: { hoverVideo: true, thumbnailBehavior: "scrub" },
        }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play");
  vi.spyOn(HTMLMediaElement.prototype, "pause");
  vi.spyOn(HTMLMediaElement.prototype, "load");
  host = document.createElement("div");
  host.tabIndex = -1;
  document.body.append(host);
  host.focus();
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

it("plays on hover and ignores pointer movement while scrub on hover stays available", async () => {
  await loadPrefs();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await act(async () => {
    root.render(
      <HoverVideo
        saveId="clip"
        src="pond://clip/video.mp4"
        unit={{ key: "video.mp4", url: "pond://clip/video.mp4", isVideo: true }}
        label="Clip"
        onBroken={() => {}}
      />,
    );
  });

  const video = host.querySelector("video");
  if (!video) throw new Error("Missing hover video");
  Object.defineProperty(video, "duration", { configurable: true, value: 10 });

  await act(async () => {
    video.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.runOnlyPendingTimers();
  });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  const startedAt = video.currentTime;

  await act(async () => {
    video.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 160, clientY: 40 }),
    );
    await nextFrame();
  });

  expect(video.currentTime).toBe(startedAt);

  await act(async () => {
    video.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

async function renderClip(posterUrl?: string): Promise<HTMLVideoElement> {
  await loadPrefs();
  await act(async () => {
    root.render(
      <HoverVideo
        saveId="clip"
        src="pond://clip/video.mp4"
        unit={{ key: "video.mp4", url: "pond://clip/video.mp4", isVideo: true }}
        posterUrl={posterUrl}
        label="Clip"
        onBroken={() => {}}
      />,
    );
  });
  const video = host.querySelector("video");
  if (!video) throw new Error("Missing hover video");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  return video;
}

/** jsdom never fetches media, so mark the element as holding a resource once src is set. */
function markLoaded(video: HTMLVideoElement): void {
  Object.defineProperty(video, "networkState", {
    configurable: true,
    value: HTMLMediaElement.NETWORK_IDLE,
  });
}

async function dispatch(video: HTMLVideoElement, event: Event): Promise<void> {
  await act(async () => {
    video.dispatchEvent(event);
  });
}

async function hover(video: HTMLVideoElement): Promise<void> {
  await act(async () => {
    video.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.runOnlyPendingTimers();
  });
}

it("waits for the pointer to rest before loading the video", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  expect(video.hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
});

it("never loads a video the pointer only passes over", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  await dispatch(video, new MouseEvent("mouseout", { bubbles: true }));
  await act(async () => {
    vi.runAllTimers();
  });

  expect(video.hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});

it("re-arms on movement after a drag vetoes the hover activation", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  document.body.dataset.saveDragging = "1";
  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(video.hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

  delete document.body.dataset.saveDragging;
  await dispatch(video, new MouseEvent("mousemove", { bubbles: true }));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
});

it("does not restart the hover delay when the pointer keeps moving", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  await dispatch(video, new MouseEvent("mousemove", { bubbles: true }));
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
});

it("releases the original after the pointer leaves a video with a poster", async () => {
  const video = await renderClip("pond://clip/poster.jpg");
  expect(video.hasAttribute("src")).toBe(false);

  await hover(video);
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  markLoaded(video);
  await dispatch(video, new Event("playing"));
  expect(video.dataset.ready).toBe("true");

  await dispatch(video, new MouseEvent("mouseout", { bubbles: true }));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();

  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(video.hasAttribute("src")).toBe(false);
  expect(video.preload).toBe("none");
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  expect(video.dataset.ready).toBeUndefined();
  expect(host.querySelector("img")?.getAttribute("src")).toContain(
    "pond://clip/poster.jpg",
  );
});

it("keeps the video loaded when the pointer returns within the grace delay", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await hover(video);
  markLoaded(video);
  await dispatch(video, new MouseEvent("mouseout", { bubbles: true }));
  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });

  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
});

it("releases the original when keyboard focus leaves a video with a poster", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await dispatch(video, new FocusEvent("focusin", { bubbles: true }));
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  markLoaded(video);

  await dispatch(video, new FocusEvent("focusout", { bubbles: true }));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(video.hasAttribute("src")).toBe(false);
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
});

it("keeps the resting frame loaded for a video without a poster", async () => {
  const video = await renderClip();
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  markLoaded(video);

  await dispatch(video, new MouseEvent("mouseover", { bubbles: true }));
  await dispatch(video, new MouseEvent("mouseout", { bubbles: true }));
  await act(async () => {
    vi.runOnlyPendingTimers();
  });

  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(video.getAttribute("src")).toBe("pond://clip/video.mp4");
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
});

it("cancels a pending release when the card unmounts", async () => {
  const video = await renderClip("pond://clip/poster.jpg");

  await hover(video);
  markLoaded(video);
  const idleTimers = vi.getTimerCount();
  await dispatch(video, new MouseEvent("mouseout", { bubbles: true }));
  expect(vi.getTimerCount()).toBe(idleTimers + 1);

  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(idleTimers);
});
