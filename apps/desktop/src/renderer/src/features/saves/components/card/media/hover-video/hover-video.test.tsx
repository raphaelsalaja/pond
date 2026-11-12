import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPrefs } from "@/shared/state/prefs";
import { HoverVideo } from "./";

let host: HTMLDivElement;
let root: Root;
const frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames.length = 0;
  vi.stubGlobal("pond", {
    query: async (name: string) => {
      if (name === "settings.getPrefs") {
        return PrefsSchema.parse({
          viewer: { hoverVideo: true, thumbnailBehavior: "scrub" },
        });
      }
      return { ok: true };
    },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() =>
    Promise.resolve(),
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  const pending = frames.splice(0);
  for (const frame of pending) frame(0);
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
  vi.spyOn(video, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 200, 100),
  );

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
    flushFrames();
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
