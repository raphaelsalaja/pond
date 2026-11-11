import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TimelinePreview } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("keeps a stable frame for portrait video", async () => {
  await act(async () => {
    root.render(<TimelinePreview src="pond://test/portrait.mp4" time={4} />);
  });

  expect(host.querySelector("video")?.style.aspectRatio).toBe("16 / 9");
});

it("stays visible and coalesces seeks while the time changes", async () => {
  const render = (time: number) =>
    act(async () => {
      root.render(<TimelinePreview src="pond://test/clip.mp4" time={time} />);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  await render(4);
  const video = host.querySelector("video");
  if (!video) throw new Error("Missing preview video");
  Object.defineProperties(video, {
    duration: { configurable: true, value: 60 },
    readyState: { configurable: true, value: HTMLMediaElement.HAVE_METADATA },
  });
  await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
  expect(video.currentTime).toBe(4);
  await act(async () => video.dispatchEvent(new Event("seeked")));
  expect(video.hasAttribute("data-ready")).toBe(true);

  await render(8);
  expect(video.currentTime).toBe(8);
  await render(12);
  expect(video.currentTime).toBe(8);
  expect(video.hasAttribute("data-ready")).toBe(true);

  await act(async () => video.dispatchEvent(new Event("seeked")));
  expect(video.currentTime).toBe(12);
  expect(video.hasAttribute("data-ready")).toBe(true);
});
