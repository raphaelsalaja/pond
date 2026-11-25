import { z } from "zod";
import type { CaptureRegion } from "@/utils/messaging";
import type { ScreenshotFormat } from "@/utils/types";

/** `capture.accept` caps a web image at 7 MB of data URL; base64 grows bytes by a third. */
const MAX_IMAGE_BYTES = 5_000_000;
const MAX_PAGE_PIXELS = 64_000_000;
const JPEG_QUALITY = 0.92;

export class ScreenshotError extends Error {}

export interface ScreenshotOptions {
  format: ScreenshotFormat;
  /** Keep the display's full pixel density; off scales to CSS pixels. */
  retina: boolean;
}

export interface Screenshot {
  dataUrl: string;
  width: number;
  height: number;
}

const TOO_LARGE =
  "This screenshot is too large to save. Capture a smaller region.";

async function bitmapFrom(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

async function encode(
  canvas: OffscreenCanvas,
  format: ScreenshotFormat,
): Promise<Screenshot> {
  const type = format === "jpeg" ? "image/jpeg" : "image/png";
  const blob = await canvas.convertToBlob({ type, quality: JPEG_QUALITY });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new ScreenshotError(TOO_LARGE);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return {
    dataUrl: `data:${type};base64,${btoa(binary)}`,
    width: canvas.width,
    height: canvas.height,
  };
}

/** Draws a slice of `source` at the size the options ask for, then encodes it. */
async function render(
  source: CanvasImageSource,
  crop: { x: number; y: number; width: number; height: number },
  density: number,
  options: ScreenshotOptions,
): Promise<Screenshot> {
  const scale = options.retina ? 1 : 1 / Math.max(1, density);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new ScreenshotError("Screenshots aren't available.");
  if (options.format === "jpeg") {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
  return encode(canvas, options.format);
}

async function requireActiveTab(tabId: number, windowId: number) {
  const [current] = await browser.tabs.query({ active: true, windowId });
  if (current?.id !== tabId) {
    throw new ScreenshotError(
      "The active tab changed. Go back to the page and capture it again.",
    );
  }
}

async function grabVisible(tabId: number, windowId: number): Promise<string> {
  await requireActiveTab(tabId, windowId);
  const data = await browser.tabs.captureVisibleTab(windowId, {
    format: "png",
  });
  await requireActiveTab(tabId, windowId);
  return data;
}

async function viewportWidth(tabId: number): Promise<number | null> {
  const [result] = await browser.scripting
    .executeScript({ target: { tabId }, func: () => innerWidth })
    .catch(() => []);
  const width = z.number().positive().safeParse(result?.result);
  return width.success ? width.data : null;
}

export async function captureVisible(
  tabId: number,
  windowId: number,
  options: ScreenshotOptions,
): Promise<Screenshot> {
  const data = await grabVisible(tabId, windowId);
  const bitmap = await bitmapFrom(data);
  try {
    const cssWidth = await viewportWidth(tabId);
    const density = cssWidth ? bitmap.width / cssWidth : 1;
    const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    return await render(bitmap, full, density, options);
  } finally {
    bitmap.close();
  }
}

export async function captureRegion(
  tabId: number,
  windowId: number,
  region: CaptureRegion,
  options: ScreenshotOptions,
): Promise<Screenshot> {
  const bitmap = await bitmapFrom(await grabVisible(tabId, windowId));
  try {
    const sx = bitmap.width / region.viewportWidth;
    const sy = bitmap.height / region.viewportHeight;
    const x = Math.max(0, Math.round(region.x * sx));
    const y = Math.max(0, Math.round(region.y * sy));
    const crop = {
      x,
      y,
      width: Math.max(
        1,
        Math.min(bitmap.width - x, Math.round(region.width * sx)),
      ),
      height: Math.max(
        1,
        Math.min(bitmap.height - y, Math.round(region.height * sy)),
      ),
    };
    return await render(bitmap, crop, sx, options);
  } finally {
    bitmap.close();
  }
}

function pageCaptureState(
  operation: "start" | "scroll" | "restore",
  x = 0,
  y = 0,
) {
  const key = "data-pond-capture-scroll";
  if (operation === "restore") {
    const previous = document.documentElement
      .getAttribute(key)
      ?.split(",")
      .map(Number);
    document.documentElement.removeAttribute(key);
    document.getElementById("pond-capture-style")?.remove();
    for (const node of document.querySelectorAll("[data-pond-capture-fixed]")) {
      node.removeAttribute("data-pond-capture-fixed");
    }
    if (previous?.length === 2) {
      window.scrollTo({
        left: previous[0] ?? 0,
        top: previous[1] ?? 0,
        behavior: "instant",
      });
    }
    return null;
  }
  if (operation === "start") {
    if (document.documentElement.hasAttribute(key)) {
      throw new Error("A page capture is already running.");
    }
    document.documentElement.setAttribute(key, `${scrollX},${scrollY}`);
    for (const node of document.querySelectorAll("body *")) {
      const position = getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") {
        node.setAttribute("data-pond-capture-fixed", "");
      }
    }
    const style = document.createElement("style");
    style.id = "pond-capture-style";
    style.textContent =
      "html{scroll-behavior:auto!important;scroll-snap-type:none!important}*{scroll-behavior:auto!important;animation-play-state:paused!important}";
    document.documentElement.append(style);
  } else {
    const style = document.getElementById("pond-capture-style");
    if (style && (x > 0 || y > 0)) {
      style.textContent +=
        "[data-pond-capture-fixed]{visibility:hidden!important}";
    }
  }
  window.scrollTo({ left: x, top: y, behavior: "instant" });
  return {
    x: scrollX,
    y: scrollY,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    width: Math.max(document.documentElement.scrollWidth, innerWidth),
    height: Math.max(document.documentElement.scrollHeight, innerHeight),
    scale: devicePixelRatio,
  };
}

/** Scrolls the page one viewport at a time and stitches each visible capture into one image. */
export async function captureFullPage(
  tabId: number,
  windowId: number,
  options: ScreenshotOptions,
): Promise<Screenshot> {
  let canvas: OffscreenCanvas | undefined;
  let density = 1;
  let started = false;
  try {
    const [initial] = await browser.scripting.executeScript({
      target: { tabId },
      func: pageCaptureState,
      args: ["start"],
    });
    const page = initial?.result;
    started = !!page;
    if (!page) {
      throw new ScreenshotError("Pond can't capture this page.");
    }
    if (page.width * page.height * page.scale ** 2 > MAX_PAGE_PIXELS) {
      throw new ScreenshotError(
        "This page is too large. Capture a region instead.",
      );
    }
    for (let y = 0; y < page.height; y += page.viewportHeight) {
      for (let x = 0; x < page.width; x += page.viewportWidth) {
        const [moved] = await browser.scripting.executeScript({
          target: { tabId },
          func: pageCaptureState,
          args: ["scroll", x, y],
        });
        const position = moved?.result;
        if (
          !position ||
          position.viewportWidth !== page.viewportWidth ||
          position.viewportHeight !== page.viewportHeight
        ) {
          throw new ScreenshotError(
            "The window size changed. Capture the page again.",
          );
        }
        /** Chrome rate-limits captureVisibleTab to about two calls a second. */
        await new Promise((resolve) => {
          setTimeout(resolve, 550);
        });
        const bitmap = await bitmapFrom(await grabVisible(tabId, windowId));
        try {
          density = bitmap.width / page.viewportWidth;
          const sy = bitmap.height / page.viewportHeight;
          canvas ??= new OffscreenCanvas(
            Math.round(page.width * density),
            Math.round(page.height * sy),
          );
          const context = canvas.getContext("2d");
          if (!context) {
            throw new ScreenshotError("Screenshots aren't available.");
          }
          context.drawImage(
            bitmap,
            Math.round(position.x * density),
            Math.round(position.y * sy),
          );
        } finally {
          bitmap.close();
        }
      }
    }
    if (!canvas) throw new ScreenshotError("Pond couldn't capture this page.");
    const full = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    return await render(canvas, full, density, options);
  } finally {
    if (started) {
      await browser.scripting
        .executeScript({
          target: { tabId },
          func: pageCaptureState,
          args: ["restore"],
        })
        .catch(() => {});
    }
  }
}
