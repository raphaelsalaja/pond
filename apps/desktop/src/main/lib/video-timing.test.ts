import { expect, it } from "vitest";
import { frameRateFromProbe } from "./video-timing";

it.each([24, 30, 60])(
  "reads %s fps from the video stream, excluding audio metadata",
  (fps) => {
    expect(
      frameRateFromProbe(
        `Stream #0:0: Audio: aac, 48000 Hz\nStream #0:1: Video: h264, yuv420p, 1920x1080, ${fps} fps, 15360 tbn`,
      ),
    ).toBe(fps);
  },
);
it("preserves fractional timing and reports unavailable metadata", () => {
  expect(frameRateFromProbe("Video: h264, 1920x1080, 29.97 fps")).toBe(
    30_000 / 1001,
  );
  expect(frameRateFromProbe("Video: h264, 1920x1080")).toBeNull();
  expect(frameRateFromProbe("Video: h264, 1920x1080, 0 fps")).toBeNull();
});
