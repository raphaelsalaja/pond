import { useVideo, Video } from "@pond/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

function Step({ delta }: { delta: number }) {
  const { actions } = useVideo();
  return (
    <button type="button" onClick={() => actions.stepFrame(delta)}>
      Step
    </button>
  );
}
afterEach(() => vi.unstubAllGlobals());
it.each([24, 30, 60, null])(
  "uses %s fps metadata and never assumes a missing frame rate",
  async (fps) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <Video.Root frameRate={fps}>
            <Video.Media src="pond://test/video.mp4" />
            <Video.Controls data-testid="controls">
              <Step delta={1} />
            </Video.Controls>
          </Video.Root>,
        ),
      );
      const video = host.querySelector("video");
      const button = host.querySelector("button");
      if (!video || !button) {
        throw new Error("Missing video controls");
      }
      await act(async () => button.focus());
      expect(
        host
          .querySelector('[data-testid="controls"]')
          ?.hasAttribute("data-visible"),
      ).toBe(true);
      await act(async () =>
        video.parentElement?.dispatchEvent(new MouseEvent("pointerleave")),
      );
      expect(
        host
          .querySelector('[data-testid="controls"]')
          ?.hasAttribute("data-visible"),
      ).toBe(true);
      Object.defineProperty(video, "duration", { value: 10 });
      video.currentTime = 2;
      await act(async () => button.click());
      expect(video.currentTime).toBeCloseTo(fps ? 2 + 1 / fps : 2, 10);
      await act(async () =>
        root.render(
          <Video.Root frameRate={fps}>
            <Video.Media src="pond://test/video.mp4" />
            <Video.Controls data-testid="controls">
              <Step delta={-10} />
            </Video.Controls>
          </Video.Root>,
        ),
      );
      await act(async () => button.click());
      expect(video.currentTime).toBeCloseTo(fps ? 2 - 9 / fps : 2, 10);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
