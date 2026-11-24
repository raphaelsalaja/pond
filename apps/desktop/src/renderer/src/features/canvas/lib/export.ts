import type { Rect, Viewport } from "@xyflow/react";

/** Keeps the stitched bitmap under Chromium's canvas area limit at 2x. */
const MAX_EXPORT_SIZE = 6000;
const IMAGE_WAIT_MS = 1500;

export interface BoardImage {
  png: Uint8Array;
  width: number;
  height: number;
}

interface RenderOptions {
  surface: HTMLElement;
  bounds: Rect;
  setViewport: (viewport: Viewport) => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function settled(surface: HTMLElement): Promise<void> {
  await nextFrame();
  await nextFrame();
  const images = [...surface.querySelectorAll("img")].map((image) =>
    image.decode().catch(() => undefined),
  );
  await Promise.race([
    Promise.all(images),
    new Promise((resolve) => {
      setTimeout(resolve, IMAGE_WAIT_MS);
    }),
  ]);
  await nextFrame();
}

/** The window can only capture what is on screen, so the board pans tile by tile and the tiles are stitched. */
export async function renderBoard({
  surface,
  bounds,
  setViewport,
}: RenderOptions): Promise<BoardImage> {
  const zoom = Math.min(
    1,
    MAX_EXPORT_SIZE / Math.max(bounds.width, bounds.height),
  );
  const box = surface.getBoundingClientRect();
  const left = Math.ceil(box.left);
  const top = Math.ceil(box.top);
  const tileWidth = Math.floor(box.right) - left;
  const tileHeight = Math.floor(box.bottom) - top;
  const width = Math.ceil(bounds.width * zoom);
  const height = Math.ceil(bounds.height * zoom);
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let scale = 1;
  for (let row = 0; row * tileHeight < height; row += 1) {
    for (let column = 0; column * tileWidth < width; column += 1) {
      setViewport({
        x: left - box.left - (bounds.x * zoom + column * tileWidth),
        y: top - box.top - (bounds.y * zoom + row * tileHeight),
        zoom,
      });
      await settled(surface);
      const rect = {
        x: left,
        y: top,
        width: Math.min(tileWidth, width - column * tileWidth),
        height: Math.min(tileHeight, height - row * tileHeight),
      };
      const bytes = await window.pond.query("canvases.capture", rect);
      const tile = await createImageBitmap(
        new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
      );
      if (!canvas || !context) {
        scale = tile.width / rect.width;
        canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Couldn't draw the canvas image.");
        }
      }
      context.drawImage(
        tile,
        Math.round(column * tileWidth * scale),
        Math.round(row * tileHeight * scale),
      );
      tile.close();
    }
  }
  const output = canvas;
  if (!output) {
    throw new Error("There's nothing to export.");
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    output.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("Couldn't encode the canvas image.");
  }
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
}
