import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import {
  renderSaveDragIcon,
  saveDragFileIconSize,
  saveDragIconSvg,
} from "./save-drag-icon";

const roots: string[] = [];

/** Sharp's cache holds input files open, which blocks the temp cleanup on Windows. */
sharp.cache(false);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("builds a layered native drag icon with a selection count", () => {
  const svg = saveDragIconSvg(
    ["data:image/png;base64,one", "data:image/png;base64,two"],
    12,
  );

  expect(svg).toContain('width="96"');
  expect(svg).toContain("data:image/png;base64,one");
  expect(svg).toContain("data:image/png;base64,two");
  expect(svg).toContain(">12</text>");
});

it("caps the visible count and renders a fallback card", () => {
  const svg = saveDragIconSvg([], 1200);
  expect(svg).toContain(">999+</text>");
  expect(svg).toContain('fill="#d7d7da"');
});

it("never asks macOS for the large file icon", () => {
  expect(saveDragFileIconSize("darwin")).toBe("normal");
  expect(saveDragFileIconSize("win32")).toBe("large");
  expect(saveDragFileIconSize("linux")).toBe("large");
});

it("leaves the count off a single save", () => {
  expect(saveDragIconSvg(["data:image/png;base64,one"], 1)).not.toContain(
    "<text",
  );
});

/** The first SVG text render initializes fonts, which takes several seconds on Windows runners. */
it("rasterizes a thumbnail into a 2x PNG and skips a save with nothing to show", {
  timeout: 60_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-drag-icon-"));
  roots.push(root);
  const thumbnail = join(root, "clip.mp4_thumbnail.webp");
  await writeFile(
    thumbnail,
    await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#336699" },
    })
      .webp()
      .toBuffer(),
  );

  const icon = await renderSaveDragIcon([thumbnail], 1);
  expect(icon).not.toBeNull();
  await expect(
    sharp(icon ?? Buffer.alloc(0)).metadata(),
  ).resolves.toMatchObject({ format: "png", width: 192, height: 152 });
  await expect(renderSaveDragIcon([null], 1)).resolves.toBeNull();
  await expect(renderSaveDragIcon([null, null], 2)).resolves.not.toBeNull();
});
