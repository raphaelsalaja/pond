import { setTimeout as sleep } from "node:timers/promises";
import type { Capture } from "@pond/schema/raw";
import { buildTextCardData, type TextCardData } from "@shared/text-card";
import { buildTweetCardData, type TweetCardData } from "@shared/tweet-card";
import { BrowserWindow, nativeImage } from "electron";
import log from "electron-log/main.js";
import sharp from "sharp";
import { z } from "zod";
import { resolveMainOut } from "../../lib/resolve-preload";
import { captureDocumentTarget } from "./capture-target";

export interface RenderedCard {
  bytes: Buffer;
  width: number;
  height: number;
}

type CaptureKind = "tweet" | "text" | "threads";

const CARD_WIDTH = 550;
const INITIAL_HEIGHT = 1400;
const MAX_HEIGHT = 8192;
const SCALE = 2;
const TWEET_PAD_CSS = 24;
const TWEET_RADIUS_CSS = 16;
const READY_TIMEOUT_MS = 12_000;
const LOAD_TIMEOUT_MS = 15_000;
/** A hidden window that never commits a frame must cost seconds, not block the Save for half a minute. */
const CAPTURE_TIMEOUT_MS = 6_000;
/** Offscreen frames arrive on the paint event; wait this long for one before retrying a capture. */
const PAINT_WAIT_MS = 1_500;
const RENDER_TIMEOUT_MS = 24_000;
const IDLE_DISPOSE_MS = 60_000;

let win: BrowserWindow | null = null;
let chain: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** Chromium treats a hash-only change as a same-document navigation; the next capturePage then never gets a frame. */
let loadSeq = 0;

function clearIdleDispose(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleDispose(): void {
  clearIdleDispose();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    disposeRenderCardWindow();
  }, IDLE_DISPOSE_MS);
  idleTimer.unref?.();
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    sleep(ms).then(() => {
      throw new Error(`${label} timed out after ${ms}ms`);
    }),
  ]);
}

function ensureWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false,
    width: CARD_WIDTH + 2,
    height: INITIAL_HEIGHT,
    webPreferences: {
      /**
       * An offscreen window keeps drawing for itself. A merely hidden one stops
       * committing frames here, which made every capturePage wait to time out.
       */
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /** Offscreen windows otherwise throttle timers/rAF, stalling image loads. */
      backgroundThrottling: false,
    },
  });
  win.on("closed", () => {
    win = null;
  });
  return win;
}

/** Resolves after the next painted frame, or after `PAINT_WAIT_MS` when nothing paints. */
function nextPaint(target: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      target.webContents.off("paint", done);
      resolve();
    };
    const timer = setTimeout(done, PAINT_WAIT_MS);
    target.webContents.once("paint", done);
  });
}

async function loadCapture(
  target: BrowserWindow,
  kind: CaptureKind,
  scheme: "light" | "dark",
  data: TweetCardData | TextCardData,
): Promise<string> {
  const documentTarget = captureDocumentTarget(
    kind,
    scheme,
    CARD_WIDTH,
    JSON.stringify(data),
  );
  /** A repeated card has the same token, so the nonce still forces a fresh document and frame. */
  const search = `${documentTarget.search}&v=${++loadSeq}`;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const load = devUrl
    ? target.loadURL(`${devUrl}/capture.html?${search}#${documentTarget.hash}`)
    : target.loadFile(resolveMainOut("../renderer/capture.html"), {
        search,
        hash: documentTarget.hash,
      });
  await withTimeout(load, LOAD_TIMEOUT_MS, "capture load");
  return documentTarget.token;
}

const CardRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

type CardRect = z.infer<typeof CardRectSchema>;

async function readCardRect(
  target: BrowserWindow,
  token: string,
): Promise<CardRect | null> {
  const expr = `(async () => {
    const token = ${JSON.stringify(token)};
    const deadline = Date.now() + ${READY_TIMEOUT_MS};
    const root = () => document.documentElement;
    while (Date.now() < deadline && (root().dataset.card !== token || root().dataset.ready !== "1")) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (root().dataset.card !== token || root().dataset.ready !== "1") return null;
    const el = document.querySelector("[data-capture-card] > *");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`;
  const raw = await withTimeout(
    target.webContents.executeJavaScript(expr, true),
    READY_TIMEOUT_MS + 2000,
    "card rect",
  );
  const parsed = CardRectSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.width < 8 || r.height < 8) {
    return null;
  }
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

const ScreenshotSchema = z.object({ data: z.string() });

/**
 * Captures `rect` at SCALE through the CDP screenshot clip. `capturePage` reads
 * a surface the window must first present; an offscreen window instead paints
 * frames it never shows, so ask the compositor directly.
 */
async function captureAtScale(
  target: BrowserWindow,
  rect: CardRect,
): Promise<Electron.NativeImage | null> {
  const dbg = target.webContents.debugger;
  let attached = false;
  if (!dbg.isAttached()) {
    dbg.attach("1.3");
    attached = true;
  }
  const clip = {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.max(1, Math.ceil(rect.width)),
    height: Math.max(1, Math.ceil(rect.height)),
    scale: SCALE,
  };
  const shoot = async (): Promise<Electron.NativeImage | null> => {
    const raw = await withTimeout(
      dbg.sendCommand("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip,
      }),
      CAPTURE_TIMEOUT_MS,
      "captureScreenshot",
    );
    const parsed = ScreenshotSchema.safeParse(raw);
    if (!parsed.success) return null;
    return nativeImage.createFromBuffer(
      Buffer.from(parsed.data.data, "base64"),
    );
  };
  try {
    try {
      return await shoot();
    } catch (err) {
      /** The first shot lands before the offscreen surface has a frame to read. */
      log.debug("[pond render-card] first capture missed", err);
    }
    await nextPaint(target);
    return await shoot();
  } finally {
    if (attached) {
      try {
        dbg.detach();
      } catch {}
    }
  }
}

async function roundCorners(bytes: Buffer, radiusPx: number): Promise<Buffer> {
  if (radiusPx <= 0) return bytes;
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 2 || height < 2) return bytes;
  const r = Math.min(radiusPx, Math.floor(Math.min(width, height) / 2));
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(bytes)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function pad(
  bytes: Buffer,
  scheme: "light" | "dark",
  padCss: number,
  radiusCss: number,
): Promise<RenderedCard> {
  const background =
    scheme === "light"
      ? { r: 255, g: 255, b: 255, alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 1 };
  let pipeline = sharp(bytes);
  if (padCss > 0) {
    const p = padCss * SCALE;
    pipeline = pipeline.extend({
      top: p,
      bottom: p,
      left: p,
      right: p,
      background,
    });
  }
  const out = await pipeline.png().toBuffer({ resolveWithObject: true });
  if (radiusCss <= 0) {
    return {
      bytes: out.data,
      width: out.info.width,
      height: out.info.height,
    };
  }
  const rounded = await roundCorners(out.data, radiusCss * SCALE);
  const meta = await sharp(rounded).metadata();
  return {
    bytes: rounded,
    width: meta.width ?? out.info.width,
    height: meta.height ?? out.info.height,
  };
}

async function renderOne(
  kind: CaptureKind,
  data: TweetCardData | TextCardData,
  scheme: "light" | "dark",
  padCss: number,
  radiusCss: number,
): Promise<RenderedCard | null> {
  const target = ensureWindow();
  /** Drop the previous card's ready flag before navigation so a fragment-only load cannot be captured. */
  await target.webContents
    .executeJavaScript("delete document.documentElement.dataset.ready", true)
    .catch(() => undefined);
  const token = await loadCapture(target, kind, scheme, data);

  let rect = await readCardRect(target, token);
  if (!rect) {
    log.warn("[pond render-card] card not ready", kind, scheme);
    return null;
  }

  const [, contentHeight] = target.getContentSize();
  const needed = Math.ceil(rect.y + rect.height + 8);
  if (needed > (contentHeight ?? INITIAL_HEIGHT)) {
    target.setContentSize(CARD_WIDTH + 2, Math.min(needed, MAX_HEIGHT));
    await sleep(150);
    rect = (await readCardRect(target, token)) ?? rect;
  }

  const image = await captureAtScale(target, rect);
  if (!image || image.getSize().width === 0) return null;
  const raw = image.toPNG();
  if (raw.byteLength === 0) return null;
  return pad(raw, scheme, padCss, radiusCss);
}

async function enqueueRender(
  kind: CaptureKind,
  data: TweetCardData | TextCardData,
  scheme: "light" | "dark",
  padCss: number,
  radiusCss = 0,
): Promise<RenderedCard | null> {
  clearIdleDispose();
  const run = chain.then(async () => {
    try {
      return await withTimeout(
        renderOne(kind, data, scheme, padCss, radiusCss),
        RENDER_TIMEOUT_MS,
        "render",
      );
    } catch (err) {
      log.warn("[pond render-card] render failed", kind, scheme, err);
      disposeRenderCardWindow();
      return null;
    } finally {
      scheduleIdleDispose();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

export async function renderTweetCardPng(
  capture: Capture | undefined | null,
  fallbackAuthor: string | null | undefined,
  scheme: "light" | "dark",
): Promise<RenderedCard | null> {
  const data = buildTweetCardData(capture, fallbackAuthor);
  if (!data || (!data.text && (!data.media || data.media.length === 0))) {
    return null;
  }
  return enqueueRender("tweet", data, scheme, TWEET_PAD_CSS, TWEET_RADIUS_CSS);
}

export async function renderThreadsCardPng(
  capture: Capture | undefined | null,
  fallbackAuthor: string | null | undefined,
  scheme: "light" | "dark",
): Promise<RenderedCard | null> {
  const data = buildTweetCardData(capture, fallbackAuthor);
  if (!data || (!data.text && (!data.media || data.media.length === 0))) {
    return null;
  }
  return enqueueRender(
    "threads",
    data,
    scheme,
    TWEET_PAD_CSS,
    TWEET_RADIUS_CSS,
  );
}

export async function renderTextCardPng(
  text: string | null | undefined,
  scheme: "light" | "dark",
): Promise<RenderedCard | null> {
  const data = buildTextCardData(text);
  if (!data) return null;
  return enqueueRender("text", data, scheme, 0);
}

export function disposeRenderCardWindow(): void {
  clearIdleDispose();
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}
