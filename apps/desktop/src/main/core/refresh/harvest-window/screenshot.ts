import type { Capture, CaptureMedia } from "@pond/schema/raw";
import type { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import sharp from "sharp";
import { z } from "zod";
import { partitionForIngest } from "../../sync/accounts";
import {
  adapt as adaptThreads,
  buildExpression as buildThreadsExpression,
} from "../harvest/threads";
import { adapt, buildExpression } from "../harvest/twitter";
import { NAV_TIMEOUT_MS } from "./constants";
import { looksLikeAuthWall, navigateWithTimeout } from "./navigation";
import { leaseWindow } from "./pool";
import { emulateColorScheme, withDeviceScaleFactor } from "./screenshot-cdp";
import {
  buildArticleRectExpression,
  buildThreadsPostRectExpression,
} from "./screenshot-dom";
import { sleep } from "./util";

export interface TweetScreenshotResult {
  ok: boolean;
  png?: { bytes: Buffer; width: number; height: number };
  reason?:
    | "navigate_failed"
    | "auth_required"
    | "no_article"
    | "timeout"
    | "capture_failed";
  quotedUrl?: string;
  media?: CaptureMedia[];
}

const SCREENSHOT_PADDING_CSS = 24;

const SCREENSHOT_ARTICLE_TIMEOUT_MS = 12_000;

const CAPTURE_DEVICE_SCALE_FACTOR = 3;

const SCREENSHOT_VERTICAL_PADDING = 40;

const SCREENSHOT_MAX_HEIGHT = 8192;

const CAPTURE_PAGE_TIMEOUT_MS = 15_000;

interface TweetDualScreenshotArgs {
  url: string;
  sourceId: string;
  parentId?: string;
  harvestMedia?: boolean;
  accountId?: string | null;
  signal?: AbortSignal;
}

interface TweetDualScreenshotResult {
  light: TweetScreenshotResult;
  dark: TweetScreenshotResult;
  quotedUrl?: string;
  media?: CaptureMedia[];
  page?: Capture;
  pageFailureReason?: TweetScreenshotResult["reason"];
}

class ScreenshotTimeoutError extends Error {}

function abortedDual(): TweetDualScreenshotResult {
  const fail: TweetScreenshotResult = { ok: false, reason: "capture_failed" };
  return { light: fail, dark: fail };
}

/** Cancel has to drop the page, or the article script keeps the window until it finishes. */
function watchAbort(
  win: BrowserWindow,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) return () => {};
  const onAbort = () => {
    if (win.isDestroyed()) return;
    win.webContents.stop();
    void win.loadURL("about:blank").catch(() => {});
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

export async function screenshotTweetDual(
  args: TweetDualScreenshotArgs,
): Promise<TweetDualScreenshotResult> {
  if (args.signal?.aborted) return abortedDual();
  const partition = await partitionForIngest("twitter", args.accountId);
  const lease = await leaseWindow("twitter", {
    partition,
    signal: args.signal,
  });
  const detachAbort = watchAbort(lease.win, args.signal);
  let restoreEmulation: (() => Promise<void>) | null = null;
  try {
    if (args.signal?.aborted) return abortedDual();
    restoreEmulation = await emulateColorScheme(lease.win, "light");
    const navOk = await navigateWithTimeout(
      lease.win,
      args.url,
      NAV_TIMEOUT_MS,
    );
    if (!navOk) {
      if (args.signal?.aborted) return abortedDual();
      log.warn("[pond screenshot:tweet] navigate failed", args.url);
      const fail: TweetScreenshotResult = {
        ok: false,
        reason: "navigate_failed",
      };
      return { light: fail, dark: fail };
    }
    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      log.info("[pond screenshot:tweet] auth wall hit", args.url);
      const wall: TweetScreenshotResult = {
        ok: false,
        reason: "auth_required",
      };
      return { light: wall, dark: wall };
    }

    const light = await captureCurrentScheme(
      lease.win,
      args.sourceId,
      "light",
      "tweet",
      args.parentId,
    );

    let media: CaptureMedia[] | undefined;
    let page: Capture | undefined;
    let pageFailureReason: TweetScreenshotResult["reason"];
    if (args.harvestMedia && light.ok) {
      const harvested = await harvestPageMedia(
        lease.win,
        args.sourceId,
        "tweet",
      );
      page = harvested.page;
      pageFailureReason = harvested.failureReason;
      if (page && page.media.length > 0) media = page.media;
    }

    if (restoreEmulation) await restoreEmulation().catch(() => {});
    restoreEmulation = await emulateColorScheme(lease.win, "dark");
    const flipped = await waitForSchemeFlip(lease.win, "dark");
    if (!flipped) {
      log.debug("[pond screenshot:tweet] scheme flip needed reload", args.url);
      await navigateWithTimeout(lease.win, args.url, NAV_TIMEOUT_MS);
    }
    const dark = await captureCurrentScheme(
      lease.win,
      args.sourceId,
      "dark",
      "tweet",
      args.parentId,
    );

    if (args.harvestMedia && !page && dark.ok) {
      const harvested = await harvestPageMedia(
        lease.win,
        args.sourceId,
        "tweet",
      );
      page = harvested.page;
      pageFailureReason = harvested.failureReason;
      if (page && page.media.length > 0) media = page.media;
    }

    if (args.signal?.aborted) return abortedDual();
    const quotedUrl = light.quotedUrl ?? dark.quotedUrl;
    const dual: TweetDualScreenshotResult = { light, dark };
    if (quotedUrl) dual.quotedUrl = quotedUrl;
    if (media) dual.media = media;
    if (page) dual.page = page;
    if (pageFailureReason) dual.pageFailureReason = pageFailureReason;
    return dual;
  } catch (err) {
    if (args.signal?.aborted) return abortedDual();
    log.warn("[pond screenshot:tweet] unexpected dual error", args.url, err);
    const fail: TweetScreenshotResult = {
      ok: false,
      reason:
        err instanceof ScreenshotTimeoutError ? "timeout" : "capture_failed",
    };
    return { light: fail, dark: fail };
  } finally {
    detachAbort();
    if (restoreEmulation) await restoreEmulation().catch(() => {});
    lease.release();
  }
}

export async function screenshotThreadsDual(
  args: TweetDualScreenshotArgs,
): Promise<TweetDualScreenshotResult> {
  if (args.signal?.aborted) return abortedDual();
  const partition = await partitionForIngest("threads", args.accountId);
  const lease = await leaseWindow("threads", {
    partition,
    signal: args.signal,
  });
  const detachAbort = watchAbort(lease.win, args.signal);
  let restoreEmulation: (() => Promise<void>) | null = null;
  try {
    if (args.signal?.aborted) return abortedDual();
    restoreEmulation = await emulateColorScheme(lease.win, "light");
    const navOk = await navigateWithTimeout(
      lease.win,
      args.url,
      NAV_TIMEOUT_MS,
    );
    if (!navOk) {
      if (args.signal?.aborted) return abortedDual();
      log.warn("[pond screenshot:threads] navigate failed", args.url);
      const fail: TweetScreenshotResult = {
        ok: false,
        reason: "navigate_failed",
      };
      return { light: fail, dark: fail };
    }
    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      log.info("[pond screenshot:threads] auth wall hit", args.url);
      const wall: TweetScreenshotResult = {
        ok: false,
        reason: "auth_required",
      };
      return { light: wall, dark: wall };
    }

    const light = await captureCurrentScheme(
      lease.win,
      args.sourceId,
      "light",
      "threads",
      args.parentId,
    );

    let media: CaptureMedia[] | undefined;
    let page: Capture | undefined;
    let pageFailureReason: TweetScreenshotResult["reason"];
    if (args.harvestMedia && light.ok) {
      const harvested = await harvestPageMedia(
        lease.win,
        args.sourceId,
        "threads",
      );
      page = harvested.page;
      pageFailureReason = harvested.failureReason;
      if (page && page.media.length > 0) media = page.media;
    }

    if (restoreEmulation) await restoreEmulation().catch(() => {});
    restoreEmulation = await emulateColorScheme(lease.win, "dark");
    const flipped = await waitForSchemeFlip(lease.win, "dark");
    if (!flipped) {
      log.debug(
        "[pond screenshot:threads] scheme flip needed reload",
        args.url,
      );
      await navigateWithTimeout(lease.win, args.url, NAV_TIMEOUT_MS);
    }
    const dark = await captureCurrentScheme(
      lease.win,
      args.sourceId,
      "dark",
      "threads",
      args.parentId,
    );

    if (args.harvestMedia && !page && dark.ok) {
      const harvested = await harvestPageMedia(
        lease.win,
        args.sourceId,
        "threads",
      );
      page = harvested.page;
      pageFailureReason = harvested.failureReason;
      if (page && page.media.length > 0) media = page.media;
    }

    if (args.signal?.aborted) return abortedDual();
    const quotedUrl = light.quotedUrl ?? dark.quotedUrl;
    const dual: TweetDualScreenshotResult = { light, dark };
    if (quotedUrl) dual.quotedUrl = quotedUrl;
    if (media) dual.media = media;
    if (page) dual.page = page;
    if (pageFailureReason) dual.pageFailureReason = pageFailureReason;
    return dual;
  } catch (err) {
    if (args.signal?.aborted) return abortedDual();
    log.warn("[pond screenshot:threads] unexpected dual error", args.url, err);
    const fail: TweetScreenshotResult = {
      ok: false,
      reason:
        err instanceof ScreenshotTimeoutError ? "timeout" : "capture_failed",
    };
    return { light: fail, dark: fail };
  } finally {
    detachAbort();
    if (restoreEmulation) await restoreEmulation().catch(() => {});
    lease.release();
  }
}

async function captureCurrentScheme(
  win: BrowserWindow,
  sourceId: string,
  colorScheme: "light" | "dark",
  kind: "tweet" | "threads",
  parentId?: string,
): Promise<TweetScreenshotResult> {
  const htmlBg = colorScheme === "light" ? "#fff" : "#000";
  const hideCss =
    kind === "tweet"
      ? `[data-testid="BottomBar"], [data-testid="bottomBar"], [data-testid="login"] { display: none !important; }
       a[href$="/quotes"], a[href$="/retweets/with_comments"] { display: none !important; }
       article { border: 0 !important; }
       html { color-scheme: ${colorScheme}; background: ${htmlBg} !important; }`
      : `html { color-scheme: ${colorScheme}; background: ${htmlBg} !important; }`;
  const cssKey = await win.webContents
    .insertCSS(hideCss)
    .catch(() => undefined);

  try {
    const initial = await readArticleRect(win, sourceId, kind, parentId);
    if (!initial) {
      log.info("[pond screenshot:tweet] no article", sourceId);
      return { ok: false, reason: "no_article" };
    }

    const [contentWidthRaw, originalContentHeightRaw] = win.getContentSize();
    const contentWidth = contentWidthRaw ?? 1280;
    const originalContentHeight = originalContentHeightRaw ?? 1024;
    const requiredHeight = Math.ceil(
      initial.y + initial.height + SCREENSHOT_VERTICAL_PADDING,
    );
    let rect = initial;
    let resized = false;
    if (requiredHeight > originalContentHeight) {
      const target = Math.min(requiredHeight, SCREENSHOT_MAX_HEIGHT);
      win.setContentSize(contentWidth, target);
      resized = true;
      await sleep(400);
      const remeasured = await readArticleRect(win, sourceId, kind, parentId);
      if (remeasured) rect = remeasured;
    }

    try {
      return await withDeviceScaleFactor(
        win,
        CAPTURE_DEVICE_SCALE_FACTOR,
        async () => {
          const image = await Promise.race([
            win.webContents.capturePage({
              x: Math.max(0, Math.floor(rect.x)),
              y: Math.max(0, Math.floor(rect.y)),
              width: Math.max(1, Math.ceil(rect.width)),
              height: Math.max(1, Math.ceil(rect.height)),
            }),
            sleep(CAPTURE_PAGE_TIMEOUT_MS).then(() => {
              throw new ScreenshotTimeoutError(
                `capturePage timed out after ${CAPTURE_PAGE_TIMEOUT_MS}ms`,
              );
            }),
          ]);
          const rawBytes = image.toPNG();
          const size = image.getSize();
          if (
            rawBytes.byteLength === 0 ||
            size.width === 0 ||
            size.height === 0
          ) {
            log.warn("[pond screenshot:tweet] empty capture", sourceId);
            return { ok: false, reason: "no_article" } as const;
          }
          const padded = await padScreenshot(rawBytes, size, colorScheme);
          const shot: TweetScreenshotResult = { ok: true, png: padded };
          if (rect.quotedUrl) shot.quotedUrl = rect.quotedUrl;
          return shot;
        },
      );
    } finally {
      if (resized) {
        try {
          win.setContentSize(contentWidth, originalContentHeight);
        } catch {}
      }
    }
  } finally {
    if (cssKey) await win.webContents.removeInsertedCSS(cssKey).catch(() => {});
  }
}

async function waitForSchemeFlip(
  win: BrowserWindow,
  target: "light" | "dark",
): Promise<boolean> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const lum = await readBackgroundLuminance(win);
    if (lum != null) {
      if (target === "dark" && lum < 0.4) return true;
      if (target === "light" && lum > 0.6) return true;
    }
    await sleep(150);
  }
  return false;
}

const LuminanceSchema = z
  .number()
  .refine(Number.isFinite)
  .nullable()
  .catch(null);

async function readBackgroundLuminance(
  win: BrowserWindow,
): Promise<number | null> {
  const expr = `(() => {
    try {
      const c = getComputedStyle(document.body).backgroundColor || '';
      const m = c.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((s) => parseFloat(s));
      const [r, g, b, a] = parts;
      if (a === 0) return null;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    } catch (_) {
      return null;
    }
  })()`;
  try {
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
      sleep(1000).then(() => null),
    ]);
    return LuminanceSchema.parse(raw);
  } catch {
    return null;
  }
}

async function harvestPageMedia(
  win: BrowserWindow,
  sourceId: string,
  kind: "tweet" | "threads",
): Promise<{
  page?: Capture;
  failureReason?: TweetScreenshotResult["reason"];
}> {
  try {
    const expr =
      kind === "threads"
        ? buildThreadsExpression(sourceId)
        : buildExpression(sourceId);
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
      sleep(SCREENSHOT_ARTICLE_TIMEOUT_MS).then(
        () => "__pond_screenshot_timeout__",
      ),
    ]);
    if (raw === "__pond_screenshot_timeout__") {
      return { failureReason: "timeout" };
    }
    const ctx = {
      source: kind === "threads" ? ("threads" as const) : ("twitter" as const),
      url: win.webContents.getURL(),
      sourceId,
    };
    const harvested =
      kind === "threads" ? adaptThreads(raw, ctx) : adapt(raw, ctx);
    return harvested ? { page: harvested } : { failureReason: "no_article" };
  } catch (err) {
    log.warn("[pond screenshot] media harvest failed", err);
    return { failureReason: "capture_failed" };
  }
}

async function padScreenshot(
  bytes: Buffer,
  raw: { width: number; height: number },
  scheme: "light" | "dark",
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const pad = SCREENSHOT_PADDING_CSS * CAPTURE_DEVICE_SCALE_FACTOR;
  const background =
    scheme === "light"
      ? { r: 255, g: 255, b: 255, alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 1 };
  try {
    const out = await sharp(bytes)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { bytes: out.data, width: out.info.width, height: out.info.height };
  } catch (err) {
    log.warn("[pond screenshot:tweet] padding failed, using raw", err);
    return { bytes, width: raw.width, height: raw.height };
  }
}

const ArticleRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    quotedUrl: z.string().optional().catch(undefined),
  })
  .nullable()
  .catch(null);

type ArticleRect = NonNullable<z.infer<typeof ArticleRectSchema>>;

async function readArticleRect(
  win: BrowserWindow,
  sourceId: string,
  kind: "tweet" | "threads",
  parentId?: string,
): Promise<ArticleRect | null> {
  const expr =
    kind === "threads"
      ? buildThreadsPostRectExpression(sourceId, parentId)
      : buildArticleRectExpression(sourceId, parentId);
  const raw = await Promise.race([
    win.webContents.executeJavaScript(expr, true),
    sleep(SCREENSHOT_ARTICLE_TIMEOUT_MS).then(
      () => "__pond_screenshot_timeout__",
    ),
  ]);
  if (raw === "__pond_screenshot_timeout__") {
    throw new ScreenshotTimeoutError(
      `article lookup timed out after ${SCREENSHOT_ARTICLE_TIMEOUT_MS}ms`,
    );
  }
  const rect = ArticleRectSchema.parse(raw);
  if (!rect || rect.width < 8 || rect.height < 8) return null;
  return rect;
}
