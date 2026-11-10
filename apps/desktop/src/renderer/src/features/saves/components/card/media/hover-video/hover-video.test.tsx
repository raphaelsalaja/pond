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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  const pending = frames.splice(0);
  for (const frame of pending) frame(0);
}

it("plays on hover and ignores pointer movement while scrub on hover stays available", async () => {
  await loadPrefs();
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
