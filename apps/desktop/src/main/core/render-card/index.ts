import { setTimeout as sleep } from "node:timers/promises";
import type { Capture } from "@pond/schema/raw";
import { buildTextCardData, type TextCardData } from "@shared/text-card";
import { buildTweetCardData, type TweetCardData } from "@shared/tweet-card";
import { BrowserWindow } from "electron";
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
const CDP_TIMEOUT_MS = 10_000;
const CAPTURE_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 30_000;
const IDLE_DISPOSE_MS = 60_000;

let win: BrowserWindow | null = null;
let chain: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /** Hidden windows otherwise throttle timers/rAF, stalling image loads. */
      backgroundThrottling: false,
    },
  });
  win.on("closed", () => {
    win = null;
  });
  return win;
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
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const load = devUrl
    ? target.loadURL(
        `${devUrl}/capture.html?${documentTarget.search}#${documentTarget.hash}`,
      )
    : target.loadFile(resolveMainOut("../renderer/capture.html"), {
        search: documentTarget.search,
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

/** Captures `rect` at SCALE via CDP device-metrics override; capturePage takes CSS px but returns a NativeImage at the overridden device scale. */
async function captureAtScale(
  target: BrowserWindow,
  rect: CardRect,
): Promise<Electron.NativeImage> {
  const dbg = target.webContents.debugger;
  let attached = false;
  if (!dbg.isAttached()) {
    dbg.attach("1.3");
    attached = true;
  }
  try {
    const [w, h] = target.getContentSize();
    await withTimeout(
      dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: w ?? CARD_WIDTH,
        height: h ?? INITIAL_HEIGHT,
        deviceScaleFactor: SCALE,
        mobile: false,
      }),
      CDP_TIMEOUT_MS,
      "setDeviceMetricsOverride",
    );
    await sleep(50);
    return await withTimeout(
      target.webContents.capturePage({
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.max(1, Math.ceil(rect.width)),
        height: Math.max(1, Math.ceil(rect.height)),
      }),
      CAPTURE_TIMEOUT_MS,
      "capturePage",
    );
  } finally {
    try {
      await withTimeout(
        dbg.sendCommand("Emulation.clearDeviceMetricsOverride"),
        CDP_TIMEOUT_MS,
        "clearDeviceMetricsOverride",
      );
    } catch {}
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
  if (image.getSize().width === 0) return null;
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
