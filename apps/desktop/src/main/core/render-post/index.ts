import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPostRenderer,
  type PostRenderer,
  type RenderedPost,
  type XPost,
} from "@pond/render";
import type { Capture } from "@pond/schema/raw";
import type { TweetCardData } from "@shared/tweet-card";
import { app } from "electron";
import log from "electron-log/main.js";
import sharp from "sharp";
import { captureToBlueskyPost } from "./bluesky-post";
import { cardDataToThreadsPost } from "./threads-post";
import { captureToXPost } from "./x-post";

/** Matches the React card, so thumbnails keep their size whichever renderer drew them. */
const POST_WIDTH = 550;
const DPR = 2;
const IDLE_DISPOSE_MS = 60_000;

let renderer: Promise<PostRenderer | null> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resourcesDir(): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, "render")]
    : [
        join(app.getAppPath(), "resources", "render"),
        join(process.cwd(), "resources", "render"),
      ];
  return (
    candidates.find((dir) => existsSync(join(dir, "pond-render.wasm"))) ?? null
  );
}

/** Arial, Apple Color Emoji and Hiragino are read from macOS; Pond may not ship them. */
function getRenderer(): Promise<PostRenderer | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  renderer ??= (async () => {
    const dir = resourcesDir();
    if (!dir) return null;
    try {
      return await createPostRenderer({
        wasmPath: join(dir, "pond-render.wasm"),
        fontsDir: join(dir, "fonts"),
        cacheDir: join(app.getPath("userData"), "render-cache"),
      });
    } catch (err) {
      log.warn("[pond render-post] renderer unavailable", err);
      return null;
    }
  })();
  return renderer;
}

function scheduleIdleDispose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(disposePostRenderer, IDLE_DISPOSE_MS);
  idleTimer.unref?.();
}

export function disposePostRenderer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const current = renderer;
  renderer = null;
  void current?.then((r) => r?.dispose());
}

async function sizeOf(
  data: string,
): Promise<{ width: number; height: number } | null> {
  const comma = data.indexOf(",");
  if (comma < 0) return null;
  try {
    const meta = await sharp(
      Buffer.from(data.slice(comma + 1), "base64"),
    ).metadata();
    return meta.width && meta.height
      ? { width: meta.width, height: meta.height }
      : null;
  } catch {
    return null;
  }
}

/** xeet lays media out from its declared size, which captures sometimes lack. */
async function fillImageSizes(post: XPost): Promise<void> {
  const boxes = [
    ...(post.media ?? []),
    ...(post.quote?.media ?? []),
    ...Object.values(post.links ?? {}).flatMap((link) =>
      link.image ? [link.image] : [],
    ),
  ];
  await Promise.all(
    boxes.map(async (box) => {
      if ((box.width > 0 && box.height > 0) || !box.data) return;
      const size = await sizeOf(box.data);
      if (size) Object.assign(box, size);
    }),
  );
  if (post.media)
    post.media = post.media.filter((m) => m.width > 0 && m.height > 0);
  if (post.quote?.media) {
    post.quote.media = post.quote.media.filter(
      (m) => m.width > 0 && m.height > 0,
    );
  }
}

async function withRenderer(
  label: string,
  draw: (engine: PostRenderer) => Promise<RenderedPost>,
): Promise<RenderedPost | null> {
  if (idleTimer) clearTimeout(idleTimer);
  const engine = await getRenderer();
  if (!engine) return null;
  try {
    return await draw(engine);
  } catch (err) {
    log.warn(`[pond render-post] ${label} render failed`, err);
    return null;
  } finally {
    scheduleIdleDispose();
  }
}

/** Draws an X save the way x.com's post page does, or null to fall back to the React card. */
export async function renderXPostPng(
  capture: Capture | null | undefined,
  fallbackAuthor: string | null | undefined,
  scheme: "light" | "dark",
): Promise<RenderedPost | null> {
  if (!capture) return null;
  const post = captureToXPost(capture, fallbackAuthor);
  if (!post) return null;
  return withRenderer(`X ${capture.id}`, async (engine) => {
    await fillImageSizes(post);
    return engine.render("twitter", post, {
      surface: "web-detail",
      theme: scheme,
      width: POST_WIDTH,
      dpr: DPR,
    });
  });
}

/** Draws the Threads card's data natively, or null to fall back to the React card. */
export async function renderThreadsPostPng(
  data: TweetCardData,
  scheme: "light" | "dark",
): Promise<RenderedPost | null> {
  const post = cardDataToThreadsPost(data);
  if (!post) return null;
  return withRenderer("Threads", (engine) =>
    engine.render("threads", post, {
      theme: scheme,
      width: POST_WIDTH,
      dpr: DPR,
    }),
  );
}

/** Draws a Bluesky save the way bsky.app's post page shows it to a logged-out reader. */
export async function renderBlueskyPostPng(
  capture: Capture | null | undefined,
  fallbackAuthor: string | null | undefined,
  scheme: "light" | "dark",
): Promise<RenderedPost | null> {
  if (!capture) return null;
  const post = captureToBlueskyPost(capture, fallbackAuthor);
  return withRenderer(`Bluesky ${capture.id}`, (engine) =>
    engine.render("bluesky", post, {
      theme: scheme,
      width: POST_WIDTH,
      dpr: DPR,
    }),
  );
}
