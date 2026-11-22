import { describe, expect, it } from "vitest";
import { fileSizeAfterMediaWrite } from "./media-file-size";

const write = (kind: "image" | "video" | "poster", size: number) => ({
  kind,
  filename: `${kind}-${size}`,
  bytes: Buffer.alloc(size),
});

describe("fileSizeAfterMediaWrite", () => {
  it("counts every new file, not just the first", () => {
    expect(
      fileSizeAfterMediaWrite([], [write("image", 3), write("image", 5)], []),
    ).toBe(8);
  });

  it("keeps the files a top-up download leaves in place", () => {
    expect(
      fileSizeAfterMediaWrite(
        [{ kind: "image", size: 10 }],
        [write("image", 4)],
        [],
      ),
    ).toBe(14);
  });

  it("drops the size of replaced kinds", () => {
    expect(
      fileSizeAfterMediaWrite(
        [
          { kind: "video", size: 100 },
          { kind: "poster", size: 7 },
          { kind: "avatar", size: 2 },
        ],
        [write("video", 50), write("poster", 3)],
        ["video", "poster"],
      ),
    ).toBe(55);
  });
});
