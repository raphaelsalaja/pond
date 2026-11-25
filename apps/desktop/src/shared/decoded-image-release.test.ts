import { expect, it } from "vitest";
import { shouldReleaseDecodedImages } from "./decoded-image-release";
import type { DecodedImageHold } from "./decoded-image-release";

function hold(patch: Partial<DecodedImageHold> = {}): DecodedImageHold {
  return {
    surface: "grid",
    viewerOpen: false,
    memoryPressure: "normal",
    ...patch,
  };
}

it("keeps decoded images on the first sample and while the grid stays up", () => {
  expect(shouldReleaseDecodedImages(null, hold())).toBe(false);
  expect(shouldReleaseDecodedImages(hold(), hold({ viewerOpen: true }))).toBe(
    false,
  );
  expect(shouldReleaseDecodedImages(hold(), hold())).toBe(false);
});

it("releases decoded images after leaving the grid or closing the Save", () => {
  expect(shouldReleaseDecodedImages(hold(), hold({ surface: "page" }))).toBe(
    true,
  );
  expect(shouldReleaseDecodedImages(hold(), hold({ surface: "rail" }))).toBe(
    true,
  );
  expect(shouldReleaseDecodedImages(hold({ viewerOpen: true }), hold())).toBe(
    true,
  );
});

it("releases when memory pressure rises, and not while it stays there", () => {
  expect(
    shouldReleaseDecodedImages(hold(), hold({ memoryPressure: "warning" })),
  ).toBe(true);
  expect(
    shouldReleaseDecodedImages(
      hold({ memoryPressure: "warning" }),
      hold({ memoryPressure: "warning" }),
    ),
  ).toBe(false);
  expect(
    shouldReleaseDecodedImages(
      hold({ memoryPressure: "warning" }),
      hold({ memoryPressure: "critical" }),
    ),
  ).toBe(true);
  expect(
    shouldReleaseDecodedImages(hold({ memoryPressure: "critical" }), hold()),
  ).toBe(false);
});
