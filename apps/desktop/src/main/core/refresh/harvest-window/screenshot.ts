import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { isJsonValue } from "@pond/schema/json";
import type { Capture, CaptureMedia } from "@pond/schema/raw";
import { app, session } from "electron";
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
  CAPTURE_ROOT_ATTRIBUTE,
  buildArticleRectExpression,
  buildCaptureMediaSettledExpression,
  buildThreadsPostRectExpression,
} from "./screenshot-dom";
import {
  buildCaptureSchemeEvidenceExpression,
  captureSchemeDomEvidenceSchema,
  captureWithSchemeValidation,
} from "./screenshot-scheme";
import type {
  CaptureColorScheme,
  CaptureSchemeDomEvidence,
  CaptureSchemeRect,
  CaptureSchemeValidationResult,
  CapturedSchemeSample,
} from "./screenshot-scheme";
import {
  acquireTwitterThemeLock,
  createTwitterThemeCookieControl,
  restoreInterruptedTwitterThemes,
} from "./screenshot-theme";
import type { TwitterThemeCookieControl } from "./screenshot-theme";

export interface TweetScreenshotResult {
  ok: boolean;
  png?: { bytes: Buffer; width: number; height: number };
  reason?:
    | "navigate_failed"
    | "auth_required"
    | "no_article"
    | "timeout"
    | "capture_failed"
    | "scheme_mismatch";
  quotedUrl?: string;
  media?: Array<CaptureMedia>;
}

const SCREENSHOT_PADDING_CSS = 24;

const SCREENSHOT_ARTICLE_TIMEOUT_MS = 12_000;

const CAPTURE_DEVICE_SCALE_FACTOR = 3;

const SCREENSHOT_VERTICAL_PADDING = 40;

const SCREENSHOT_MAX_HEIGHT = 8192;

const CAPTURE_PAGE_TIMEOUT_MS = 15_000;

/** Matches the native card renderer's image wait. */
const CAPTURE_MEDIA_WAIT_MS = 6000;

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
  media?: Array<CaptureMedia>;
  page?: Capture;
  pageFailureReason?: TweetScreenshotResult["reason"];
}

class ScreenshotTimeoutError extends Error {}

function abortedDual(): TweetDualScreenshotResult {
  const fail: TweetScreenshotResult = { ok: false, reason: "capture_failed" };
  return { light: fail, dark: fail };
}

/** Cancel only needs the page gone; a blank load the pool interrupts has done that. */
function ignoreInterruptedBlank(): void {}

/** Cancel has to drop the page, or the article script keeps the window until it finishes. */
function watchAbort(
  win: BrowserWindow,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) return () => {};
  const onAbort = () => {
    if (win.isDestroyed()) return;
    win.webContents.stop();
    void win.loadURL("about:blank").catch(ignoreInterruptedBlank);
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
  let lease: Awaited<ReturnType<typeof leaseWindow>> | null = null;
  let detachAbort: () => void = () => {};
  let themeCookies: TwitterThemeCookieControl | null = null;
  let restoreEmulation: (() => Promise<void>) | null = null;
  const releaseThemeLock = await acquireTwitterThemeLock(
    partition,
    args.signal,
  ).catch(() => null);
  if (!releaseThemeLock) return abortedDual();
  try {
    if (args.signal?.aborted) return abortedDual();
    lease = await leaseWindow("twitter", {
      partition,
      signal: args.signal,
    });
    const win = lease.win;
    detachAbort = watchAbort(win, args.signal);
    const themeCookieControl = createTwitterThemeCookieControl({
      jar: win.webContents.session.cookies,
      partition,
      journalPath: themeJournalPath(),
    });
    themeCookies = themeCookieControl;
    await themeCookieControl.setScheme("light");
    restoreEmulation = await emulateColorScheme(win, "light");
    const navOk = await navigateWithTimeout(win, args.url, NAV_TIMEOUT_MS);
    if (!navOk) {
      if (args.signal?.aborted) return abortedDual();
      log.warn("[pond screenshot:tweet] navigate failed", args.url);
      const fail: TweetScreenshotResult = {
        ok: false,
        reason: "navigate_failed",
      };
      return { light: fail, dark: fail };
    }
    if (looksLikeAuthWall(win.webContents.getURL())) {
      log.info("[pond screenshot:tweet] auth wall hit", args.url);
      const wall: TweetScreenshotResult = {
        ok: false,
        reason: "auth_required",
      };
      return { light: wall, dark: wall };
    }

    const light = await captureCurrentScheme(
      win,
      args.sourceId,
      "light",
      "tweet",
      args.parentId,
      onceSchemeReload(() =>
        reloadForScheme(win, args.url, "light", themeCookieControl),
      ),
    );

    let media: Array<CaptureMedia> | undefined;
    let page: Capture | undefined;
    let pageFailureReason: TweetScreenshotResult["reason"];
    if (args.harvestMedia && light.ok) {
      const harvested = await harvestPageMedia(win, args.sourceId, "tweet");
      page = harvested.page;
      pageFailureReason = harvested.failureReason;
      if (page && page.media.length > 0) media = page.media;
    }

    if (restoreEmulation) await restoreEmulation().catch(() => {});
    await themeCookieControl.setScheme("dark");
    restoreEmulation = await emulateColorScheme(win, "dark");
    const reloadDarkOnce = onceSchemeReload(() =>
      reloadForScheme(win, args.url, "dark", themeCookieControl),
    );
    const flipped = await waitForSchemeFlip(win, "dark");
    if (!flipped) {
      log.debug("[pond screenshot:tweet] scheme flip needed reload", args.url);
      await reloadDarkOnce();
    }
    const dark = await captureCurrentScheme(
      win,
      args.sourceId,
      "dark",
      "tweet",
      args.parentId,
      reloadDarkOnce,
    );

    if (args.harvestMedia && !page && dark.ok) {
      const harvested = await harvestPageMedia(win, args.sourceId, "tweet");
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
  } catch (error) {
    if (args.signal?.aborted) {
      return abortedDual();
    }
    log.warn("[pond screenshot:tweet] unexpected dual error", args.url, error);
    const fail: TweetScreenshotResult = {
      ok: false,
      reason:
        error instanceof ScreenshotTimeoutError ? "timeout" : "capture_failed",
    };
    return { light: fail, dark: fail };
  } finally {
    detachAbort();
    if (restoreEmulation) await restoreEmulation().catch(() => {});
    await themeCookies?.restore();
    lease?.release();
    releaseThemeLock();
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
      onceSchemeReload(() => reloadForScheme(lease.win, args.url, "light")),
    );

    let media: Array<CaptureMedia> | undefined;
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
    const reloadDarkOnce = onceSchemeReload(() =>
      reloadForScheme(lease.win, args.url, "dark"),
    );
    const flipped = await waitForSchemeFlip(lease.win, "dark");
    if (!flipped) {
      log.debug(
        "[pond screenshot:threads] scheme flip needed reload",
        args.url,
      );
      await reloadDarkOnce();
    }
    const dark = await captureCurrentScheme(
      lease.win,
      args.sourceId,
      "dark",
      "threads",
      args.parentId,
      reloadDarkOnce,
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
  } catch (error) {
    if (args.signal?.aborted) {
      return abortedDual();
    }
    log.warn(
      "[pond screenshot:threads] unexpected dual error",
      args.url,
      error,
    );
    const fail: TweetScreenshotResult = {
      ok: false,
      reason:
        error instanceof ScreenshotTimeoutError ? "timeout" : "capture_failed",
    };
    return { light: fail, dark: fail };
  } finally {
    detachAbort();
    if (restoreEmulation) await restoreEmulation().catch(() => {});
    lease.release();
  }
}

function themeJournalPath(): string {
  return join(app.getPath("userData"), "screenshot-theme-journal.json");
}

/** Puts back X theme cookies that a capture interrupted by a quit or crash left overridden. */
export async function restoreInterruptedScreenshotThemes(): Promise<void> {
  await restoreInterruptedTwitterThemes({
    journalPath: themeJournalPath(),
    jarFor: (partition) => session.fromPartition(partition).cookies,
  });
}

function onceSchemeReload(
  reload: () => Promise<boolean>,
): () => Promise<boolean> {
  let used = false;
  return async () => {
    if (used) return false;
    used = true;
    return reload();
  };
}

interface TweetSchemeCaptureSample extends CapturedSchemeSample {
  quotedUrl?: string;
}

class ScreenshotNoArticleError extends Error {}

async function captureCurrentScheme(
  win: BrowserWindow,
  sourceId: string,
  colorScheme: CaptureColorScheme,
  kind: "tweet" | "threads",
  parentId: string | undefined,
  correctScheme: () => Promise<boolean>,
): Promise<TweetScreenshotResult> {
  const hideCss =
    kind === "tweet"
      ? `[data-testid="BottomBar"], [data-testid="bottomBar"], [data-testid="login"] { display: none !important; }
       a[href$="/quotes"], a[href$="/retweets/with_comments"] { display: none !important; }
       article { border: 0 !important; }
       html { color-scheme: ${colorScheme}; }`
      : `html { color-scheme: ${colorScheme}; }`;

  const attempt = async (): Promise<TweetSchemeCaptureSample> => {
    const cssKey = await win.webContents
      .insertCSS(hideCss)
      .catch(() => undefined);
    let originalSize: { width: number; height: number } | null = null;
    try {
      const initial = await readArticleRect(win, sourceId, kind, parentId);
      if (!initial) {
        log.info("[pond screenshot:tweet] no article", sourceId);
        throw new ScreenshotNoArticleError();
      }

      const [contentWidthRaw, originalContentHeightRaw] = win.getContentSize();
      const contentWidth = contentWidthRaw ?? 1280;
      const originalContentHeight = originalContentHeightRaw ?? 1024;
      const requiredHeight = Math.ceil(
        initial.y + initial.height + SCREENSHOT_VERTICAL_PADDING,
      );
      let rect = initial;
      if (requiredHeight > originalContentHeight) {
        const target = Math.min(requiredHeight, SCREENSHOT_MAX_HEIGHT);
        originalSize = { width: contentWidth, height: originalContentHeight };
        win.setContentSize(contentWidth, target);
        await sleep(400);
        const remeasured = await readArticleRect(win, sourceId, kind, parentId);
        if (remeasured) rect = remeasured;
      }

      if (!(await waitForCaptureMedia(win))) {
        log.info("[pond screenshot:tweet] media still loading", sourceId);
      }

      try {
        return await withDeviceScaleFactor(
          win,
          CAPTURE_DEVICE_SCALE_FACTOR,
          async () => {
            const evidence = await readCaptureSchemeEvidence(win, rect);
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
              throw new ScreenshotNoArticleError();
            }
            const sample: TweetSchemeCaptureSample = {
              bytes: rawBytes,
              width: size.width,
              height: size.height,
              cssWidth: rect.width,
              cssHeight: rect.height,
              evidence,
            };
            if (rect.quotedUrl) sample.quotedUrl = rect.quotedUrl;
            return sample;
          },
        );
      } finally {
        if (originalSize) {
          try {
            win.setContentSize(originalSize.width, originalSize.height);
          } catch {
            /** The window may already be destroyed, and the next lease resizes it anyway. */
          }
        }
      }
    } finally {
      if (cssKey) {
        await win.webContents.removeInsertedCSS(cssKey).catch(() => {});
      }
    }
  };

  let validated: CaptureSchemeValidationResult<TweetSchemeCaptureSample>;
  try {
    validated = await captureWithSchemeValidation({
      scheme: colorScheme,
      attempt,
      correct: correctScheme,
    });
  } catch (error) {
    if (error instanceof ScreenshotNoArticleError) {
      return { ok: false, reason: "no_article" };
    }
    throw error;
  }
  if (!validated.ok) {
    log.info("[pond screenshot:tweet] scheme mismatch", sourceId, colorScheme);
    return { ok: false, reason: "scheme_mismatch" };
  }
  if (!validated.verified) {
    log.info(
      "[pond screenshot:tweet] scheme unverified",
      sourceId,
      colorScheme,
    );
  }

  const padded = await padScreenshot(
    validated.sample.bytes,
    { width: validated.sample.width, height: validated.sample.height },
    colorScheme,
  );
  const shot: TweetScreenshotResult = { ok: true, png: padded };
  if (validated.sample.quotedUrl) shot.quotedUrl = validated.sample.quotedUrl;
  return shot;
}

async function readCaptureSchemeEvidence(
  win: BrowserWindow,
  rect: CaptureSchemeRect,
): Promise<CaptureSchemeDomEvidence> {
  try {
    const raw: unknown = await Promise.race([
      win.webContents.executeJavaScript(
        buildCaptureSchemeEvidenceExpression(CAPTURE_ROOT_ATTRIBUTE, rect),
        true,
      ),
      sleep(1500).then(() => null),
    ]);
    return captureSchemeDomEvidenceSchema.parse(raw);
  } catch {
    return captureSchemeDomEvidenceSchema.parse(null);
  }
}

async function reloadForScheme(
  win: BrowserWindow,
  url: string,
  colorScheme: CaptureColorScheme,
  themeCookies?: TwitterThemeCookieControl,
): Promise<boolean> {
  if (themeCookies) await themeCookies.setScheme(colorScheme);
  const navOk = await navigateWithTimeout(win, url, NAV_TIMEOUT_MS);
  if (!navOk) return false;
  await waitForSchemeFlip(win, colorScheme);
  return true;
}

async function waitForSchemeFlip(
  win: BrowserWindow,
  target: "light" | "dark",
): Promise<boolean> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const lum = await readBackgroundLuminance(win);
    if (lum !== null) {
      if (target === "dark" && lum < 0.4) {
        return true;
      }
      if (target === "light" && lum > 0.6) {
        return true;
      }
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
    const raw: unknown = await Promise.race([
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
    const result: unknown = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
      sleep(SCREENSHOT_ARTICLE_TIMEOUT_MS).then(
        () => "__pond_screenshot_timeout__",
      ),
    ]);
    if (result === "__pond_screenshot_timeout__") {
      return { failureReason: "timeout" };
    }
    const raw = isJsonValue(result) ? result : null;
    const ctx = {
      source: kind === "threads" ? ("threads" as const) : ("twitter" as const),
      url: win.webContents.getURL(),
      sourceId,
    };
    const harvested =
      kind === "threads" ? adaptThreads(raw, ctx) : adapt(raw, ctx);
    return harvested ? { page: harvested } : { failureReason: "no_article" };
  } catch (error) {
    log.warn("[pond screenshot] media harvest failed", error);
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
  } catch (error) {
    log.warn("[pond screenshot:tweet] padding failed, using raw", error);
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

async function waitForCaptureMedia(win: BrowserWindow): Promise<boolean> {
  return Promise.race([
    win.webContents
      .executeJavaScript(
        buildCaptureMediaSettledExpression(CAPTURE_MEDIA_WAIT_MS),
        true,
      )
      .then(
        (settled) => settled === true,
        (cause: unknown) => {
          log.warn("[pond screenshot:tweet] media wait failed", cause);
          return false;
        },
      ),
    sleep(CAPTURE_MEDIA_WAIT_MS + 2000).then(() => false),
  ]);
}

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
  const raw: unknown = await Promise.race([
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
