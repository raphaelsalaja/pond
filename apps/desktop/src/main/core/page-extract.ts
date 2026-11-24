import { randomUUID } from "node:crypto";
import type { SavesImportResult } from "@shared/saves-contracts-shared";
import { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";

const MIN_EDGE = 200;
const MAX_ASSETS = 40;
const LOAD_MS = 15_000;

const PageImagesSchema = z
  .array(z.object({ src: z.string(), width: z.number(), height: z.number() }))
  .nullable();

export function pickPageImages(
  images: Array<{ src: string; width: number; height: number }>,
  minEdge = MIN_EDGE,
  maxAssets = MAX_ASSETS,
) {
  return images
    .filter(
      (img) =>
        img.width >= minEdge &&
        img.height >= minEdge &&
        /^https?:/i.test(img.src),
    )
    .slice(0, maxAssets);
}

export function pageAssetsDraft(input: {
  id: string;
  originUrl: string;
  images: Array<{ src: string; width: number; height: number }>;
}) {
  return {
    id: input.id,
    originUrl: input.originUrl,
    metadata: { tags: ["page-asset"], folderIds: [] },
    items: pickPageImages(input.images).map((img) => ({
      kind: "asset" as const,
      url: img.src,
    })),
  };
}

export async function extractPageAssets(
  url: string,
): Promise<SavesImportResult> {
  let href: string;
  try {
    href = new URL(url).toString();
  } catch {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      queued: 0,
      error: "invalid_url",
    };
  }
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  try {
    await win.loadURL(href, { extraHeaders: "pragma: no-cache\n" });
    const images = PageImagesSchema.parse(
      await Promise.race([
        win.webContents.executeJavaScript(
          `([...document.images]).map((img) => ({
          src: img.currentSrc || img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
        }))`,
          true,
        ),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), LOAD_MS);
        }),
      ]),
    );
    if (!images) {
      return {
        ok: false,
        imported: 0,
        skipped: 0,
        queued: 0,
        error: "timeout",
      };
    }
    const draft = pageAssetsDraft({
      id: randomUUID(),
      originUrl: href,
      images,
    });
    const skipped = images.length - draft.items.length;
    if (draft.items.length === 0) {
      return { ok: true, imported: 0, skipped, queued: 0 };
    }
    const { captures } = await import("./captures");
    await captures.accept(draft);
    return {
      ok: true,
      imported: 0,
      skipped,
      queued: draft.items.length,
    };
  } catch (error) {
    log.warn("[pond page-extract] failed", href, error);
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      queued: 0,
      error: "extract_failed",
    };
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}
