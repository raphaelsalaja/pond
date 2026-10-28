import type { NewSave, Source } from "@pond/schema/db";
import type { Capture, CaptureMedia, RawJson } from "@pond/schema/raw";
import { QUOTE_DEPTH_CAP } from "@pond/schema/raw";
import log from "electron-log/main.js";
import { persistSave } from "../../persist-save";
import {
  screenshotThreadsDual,
  screenshotTweetDual,
  type TweetScreenshotResult,
} from "../../refresh/harvest-window";
import {
  type RenderedCard,
  renderThreadsCardPng,
  renderTweetCardPng,
} from "../../render-card";
import { TransientError } from "../extractors/errors";
import { readSave, type WriteFileArgs } from "./apply";
import {
  type InlinedAvatars,
  inlineCaptureAvatars,
} from "./inline-card-avatars";

const TWEET_SCREENSHOT_LIGHT_KIND = "tweet_screenshot_light";
const TWEET_SCREENSHOT_DARK_KIND = "tweet_screenshot_dark";

function quoteScreenshotKind(depth: number, scheme: "light" | "dark"): string {
  return `tweet_screenshot_quote${depth}_${scheme}`;
}

const CAPTURE_TWEET_VERSION = 12;
/** A reply image is the reply itself, so a crop that leads with the parent post is stale. */
const REPLY_CAPTURE_TWEET_VERSION = 14;

export interface CaptureTweetResult {
  captured: number;
  authWall: boolean;
  mediaAdded: boolean;
  replyParentPending: boolean;
}

interface CaptureTweetOptions {
  nativeOnly?: boolean;
  retryPendingParent?: boolean;
  signal?: AbortSignal;
}

export interface CaptureTweetSave {
  id: string;
  source: Source;
  sourceId: string;
  url: string;
  author: string | null;
  rawJson: RawJson | null;
}

interface PersistSaveOptions {
  actorReason: string;
  newFiles?: WriteFileArgs[];
  replaceFilesWithKind?: WriteFileArgs["kind"] | WriteFileArgs["kind"][];
}

export interface CaptureTweetPorts<SaveRow extends CaptureTweetSave> {
  readSave(id: string): Promise<SaveRow | null>;
  persistSave(
    id: string,
    patch: Partial<NewSave>,
    options: PersistSaveOptions,
  ): Promise<void>;
  screenshotTweetDual: typeof screenshotTweetDual;
  screenshotThreadsDual: typeof screenshotThreadsDual;
  renderTweetCardPng: typeof renderTweetCardPng;
  renderThreadsCardPng: typeof renderThreadsCardPng;
  inlineCaptureAvatars(
    capture: Capture,
    save: SaveRow,
  ): Promise<InlinedAvatars>;
}

function readCaptureTweetVersion(rawJson: RawJson | null): number {
  const version = rawJson?.captureTweetVersion;
  return version !== undefined && Number.isFinite(version) ? version : 0;
}

function targetCaptureTweetVersion(rawJson: RawJson | null): number {
  return rawJson?.capture?.replyTo
    ? REPLY_CAPTURE_TWEET_VERSION
    : CAPTURE_TWEET_VERSION;
}

export function isCaptureTweetStale(rawJson: RawJson | null): boolean {
  return readCaptureTweetVersion(rawJson) < targetCaptureTweetVersion(rawJson);
}

function needsReplyParentEnrichment(rawJson: RawJson | null): boolean {
  const parent = rawJson?.capture?.replyTo;
  if (!parent?.url) return false;
  if (rawJson?.capture?.extras?.replyParentUnavailable === true) return false;
  return !(
    parent.description ||
    parent.title ||
    parent.media.length > 0 ||
    parent.quoted
  );
}

export function createCaptureTweetRunner<SaveRow extends CaptureTweetSave>(
  ports: CaptureTweetPorts<SaveRow>,
) {
  return (
    saveId: string,
    opts?: CaptureTweetOptions,
  ): Promise<CaptureTweetResult> =>
    runCaptureTweetWithPorts(saveId, opts, ports);
}

export function createCaptureTweetTask(
  captureTweet: (
    saveId: string,
    opts?: CaptureTweetOptions,
  ) => Promise<CaptureTweetResult>,
) {
  return async (saveId: string, signal?: AbortSignal): Promise<void> => {
    const result = await captureTweet(saveId, {
      retryPendingParent: true,
      ...(signal ? { signal } : {}),
    });
    if (signal?.aborted) return;
    if (result.authWall && result.captured === 0) {
      throw new TransientError(
        "capture_tweet: X auth wall (session may be expired)",
      );
    }
    if (result.replyParentPending) {
      throw new TransientError("capture_tweet: reply parent still pending");
    }
  };
}

async function runCaptureTweetWithPorts<SaveRow extends CaptureTweetSave>(
  saveId: string,
  opts: CaptureTweetOptions | undefined,
  ports: CaptureTweetPorts<SaveRow>,
): Promise<CaptureTweetResult> {
  const idle: CaptureTweetResult = {
    captured: 0,
    authWall: false,
    mediaAdded: false,
    replyParentPending: false,
  };
  const save = await ports.readSave(saveId);
  if (!save || opts?.signal?.aborted) return idle;
  if (save.source !== "twitter" && save.source !== "threads") return idle;
  if (!save.sourceId) return idle;

  if (
    !isCaptureTweetStale(save.rawJson) &&
    !(opts?.retryPendingParent && needsReplyParentEnrichment(save.rawJson))
  ) {
    log.debug("[pond pipeline:capture-tweet] up to date, skipping", saveId);
    return idle;
  }

  let rawJson = save.rawJson;
  if (!opts?.nativeOnly) {
    const enrichment = await fillReplyParent(saveId, save, ports, opts?.signal);
    if (opts?.signal?.aborted) return idle;
    if (enrichment === "enriched" || enrichment === "unavailable") {
      const refreshed = await ports.readSave(saveId);
      if (refreshed?.rawJson) rawJson = refreshed.rawJson;
    }
  }

  if (opts?.signal?.aborted) return idle;
  const rendered = await tryNativeRender(saveId, { ...save, rawJson }, ports);
  if (opts?.signal?.aborted) return idle;
  if (rendered) {
    await finalizeRawJson(saveId, rawJson, [], { stampVersion: true }, ports);
    log.info("[pond pipeline:capture-tweet] native card done", { saveId });
    return {
      captured: 2,
      authWall: false,
      mediaAdded: false,
      replyParentPending: needsReplyParentEnrichment(rawJson),
    };
  }

  if (opts?.nativeOnly) {
    log.debug(
      "[pond pipeline:capture-tweet] native miss, skipping live screenshot",
      saveId,
    );
    return idle;
  }

  let captured = 0;
  let authWall = false;
  const harvested: CaptureMedia[] = [];

  const mainArgs: CaptureVariantsArgs = {
    url: save.url,
    sourceId: save.sourceId,
    source: save.source,
    lightKind: TWEET_SCREENSHOT_LIGHT_KIND,
    darkKind: TWEET_SCREENSHOT_DARK_KIND,
    lightFilename: "tweet-light.png",
    darkFilename: "tweet-dark.png",
    harvestMedia: false,
  };
  if (opts?.signal) mainArgs.signal = opts.signal;
  if (opts?.signal?.aborted) return idle;
  const main = await captureVariants(saveId, mainArgs, ports);
  if (opts?.signal?.aborted) return idle;
  captured += main.captured;
  if (main.authWall) authWall = true;

  if (main.authWall && main.captured === 0) {
    return {
      captured,
      authWall: true,
      mediaAdded: false,
      replyParentPending: needsReplyParentEnrichment(rawJson),
    };
  }

  let completed = main.complete;
  let nextUrl = main.quotedUrl ?? quotedUrlFromCapture(rawJson);
  for (let depth = 1; nextUrl && depth <= QUOTE_DEPTH_CAP; depth += 1) {
    if (opts?.signal?.aborted) return idle;
    const quotedId =
      save.source === "threads"
        ? parsePostCode(nextUrl)
        : parseTweetId(nextUrl);
    if (!quotedId) break;
    const quote = await captureVariants(
      saveId,
      {
        url: nextUrl,
        sourceId: quotedId,
        source: save.source,
        lightKind: quoteScreenshotKind(depth, "light"),
        darkKind: quoteScreenshotKind(depth, "dark"),
        lightFilename: `tweet-quote${depth}-light.png`,
        darkFilename: `tweet-quote${depth}-dark.png`,
        harvestMedia: true,
        signal: opts?.signal,
      },
      ports,
    );
    if (opts?.signal?.aborted) return idle;
    captured += quote.captured;
    if (quote.media) harvested.push(...quote.media);
    if (quote.authWall) {
      authWall = true;
      completed = false;
      break;
    }
    if (!quote.complete) completed = false;
    nextUrl = quote.quotedUrl;
  }

  const mediaAdded = await finalizeRawJson(
    saveId,
    rawJson,
    harvested,
    { stampVersion: completed },
    ports,
  );

  log.info("[pond pipeline:capture-tweet] done", {
    saveId,
    captured,
    mediaAdded,
    completed,
  });
  return {
    captured,
    authWall,
    mediaAdded,
    replyParentPending: needsReplyParentEnrichment(rawJson),
  };
}

export const runCaptureTweet = createCaptureTweetRunner({
  readSave,
  persistSave: async (...args) => {
    await persistSave(...args);
  },
  screenshotTweetDual,
  screenshotThreadsDual,
  renderTweetCardPng,
  renderThreadsCardPng,
  inlineCaptureAvatars,
});

export const runCaptureTweetTask = createCaptureTweetTask(runCaptureTweet);

async function tryNativeRender<SaveRow extends CaptureTweetSave>(
  saveId: string,
  save: SaveRow,
  ports: CaptureTweetPorts<SaveRow>,
): Promise<boolean> {
  const capture = save.rawJson?.capture ?? null;
  if (!capture) return false;
  const inlined = await ports.inlineCaptureAvatars(capture, save);
  const render =
    save.source === "threads"
      ? ports.renderThreadsCardPng
      : ports.renderTweetCardPng;
  const light = await render(inlined.capture, save.author, "light");
  if (!light) return false;
  const dark = await render(inlined.capture, save.author, "dark");
  if (!dark) return false;
  await writeCardPng(
    saveId,
    TWEET_SCREENSHOT_LIGHT_KIND,
    "tweet-light.png",
    light,
    ports,
  );
  await writeCardPng(
    saveId,
    TWEET_SCREENSHOT_DARK_KIND,
    "tweet-dark.png",
    dark,
    ports,
  );
  if (inlined.avatarFile) {
    const avatar: WriteFileArgs = {
      kind: "avatar",
      filename: inlined.avatarFile.filename,
      bytes: Buffer.from(inlined.avatarFile.bytes),
    };
    if (inlined.avatarFile.mimeType)
      avatar.mimeType = inlined.avatarFile.mimeType;
    if (inlined.avatarSourceUrl) avatar.sourceUrl = inlined.avatarSourceUrl;
    try {
      await ports.persistSave(
        saveId,
        {},
        {
          actorReason: "pipeline:capture-tweet:avatar",
          newFiles: [avatar],
        },
      );
    } catch (err) {
      log.warn(
        "[pond pipeline:capture-tweet] avatar persist failed",
        saveId,
        err,
      );
    }
  }
  return true;
}

async function writeCardPng(
  saveId: string,
  kind: string,
  filename: string,
  card: RenderedCard,
  ports: Pick<CaptureTweetPorts<CaptureTweetSave>, "persistSave">,
): Promise<void> {
  await ports.persistSave(
    saveId,
    {},
    {
      actorReason: `pipeline:capture-tweet:${kind}`,
      replaceFilesWithKind: kind,
      newFiles: [
        {
          kind,
          filename,
          bytes: card.bytes,
          mimeType: "image/png",
          width: card.width,
          height: card.height,
        },
      ],
    },
  );
}

interface CaptureVariantsArgs {
  url: string;
  sourceId: string;
  source: "twitter" | "threads";
  parentId?: string;
  lightKind: string;
  darkKind: string;
  lightFilename: string;
  darkFilename: string;
  harvestMedia: boolean;
  persistScreenshots?: boolean;
  signal?: AbortSignal;
}

interface CaptureVariantsResult {
  captured: number;
  complete: boolean;
  authWall: boolean;
  quotedUrl?: string;
  media?: CaptureMedia[];
  page?: Capture;
  failureReason?: TweetScreenshotResult["reason"];
}

async function captureVariants<SaveRow extends CaptureTweetSave>(
  saveId: string,
  args: CaptureVariantsArgs,
  ports: CaptureTweetPorts<SaveRow>,
): Promise<CaptureVariantsResult> {
  let captured = 0;
  let authWall = false;
  let lightOk = false;
  let darkOk = false;

  if (args.signal?.aborted) {
    return { captured: 0, complete: false, authWall: false };
  }
  const shotArgs: Parameters<typeof screenshotTweetDual>[0] = {
    url: args.url,
    sourceId: args.sourceId,
    harvestMedia: args.harvestMedia,
  };
  if (args.parentId) shotArgs.parentId = args.parentId;
  if (args.signal) shotArgs.signal = args.signal;
  const dual =
    args.source === "threads"
      ? await ports.screenshotThreadsDual(shotArgs)
      : await ports.screenshotTweetDual(shotArgs);

  const light: TweetScreenshotResult = dual.light;
  if (light.ok && light.png) {
    if (args.persistScreenshots !== false) {
      await writeScreenshot(
        saveId,
        args.lightKind,
        args.lightFilename,
        light,
        ports,
      );
      captured += 1;
    }
    lightOk = true;
  } else if (light.reason === "auth_required") {
    authWall = true;
  }

  const dark: TweetScreenshotResult = dual.dark;
  if (dark.ok && dark.png) {
    if (args.persistScreenshots !== false) {
      await writeScreenshot(
        saveId,
        args.darkKind,
        args.darkFilename,
        dark,
        ports,
      );
      captured += 1;
    }
    darkOk = true;
  } else if (dark.reason === "auth_required") {
    authWall = true;
  }

  const quotedUrl = dual.quotedUrl;
  const media = dual.media;

  const result: CaptureVariantsResult = {
    captured,
    complete: lightOk && darkOk,
    authWall,
  };
  if (quotedUrl) result.quotedUrl = quotedUrl;
  if (media) result.media = media;
  if (dual.page) result.page = dual.page;
  const variantFailureReason =
    args.harvestMedia && !dual.page && (light.ok || dark.ok)
      ? "capture_failed"
      : light.reason === "auth_required" || dark.reason === "auth_required"
        ? "auth_required"
        : light.reason === "timeout" || dark.reason === "timeout"
          ? "timeout"
          : light.reason === "capture_failed" ||
              dark.reason === "capture_failed"
            ? "capture_failed"
            : (light.reason ?? dark.reason);
  result.failureReason =
    args.harvestMedia && !dual.page && (light.ok || dark.ok)
      ? dual.pageFailureReason === "timeout" ||
        dual.pageFailureReason === "capture_failed"
        ? dual.pageFailureReason
        : "capture_failed"
      : (dual.pageFailureReason ?? variantFailureReason);
  return result;
}

async function writeScreenshot(
  saveId: string,
  kind: string,
  filename: string,
  result: TweetScreenshotResult,
  ports: Pick<CaptureTweetPorts<CaptureTweetSave>, "persistSave">,
): Promise<void> {
  if (!result.png) return;
  await ports.persistSave(
    saveId,
    {},
    {
      actorReason: `pipeline:capture-tweet:${kind}`,
      replaceFilesWithKind: kind,
      newFiles: [
        {
          kind,
          filename,
          bytes: result.png.bytes,
          mimeType: "image/png",
          width: result.png.width,
          height: result.png.height,
        },
      ],
    },
  );
}

async function finalizeRawJson<SaveRow extends CaptureTweetSave>(
  saveId: string,
  stored: RawJson | null,
  harvested: CaptureMedia[],
  opts: { stampVersion: boolean },
  ports: CaptureTweetPorts<SaveRow>,
): Promise<boolean> {
  if (!stored) return false;
  const rawJson = structuredClone(stored);
  if (!rawJson.capture) return false;

  const existing = rawJson.capture.media ?? [];
  const seen = new Set(existing.map((m) => m.url));
  let mediaAdded = false;
  for (const m of harvested) {
    if (!m.url || seen.has(m.url)) continue;
    seen.add(m.url);
    existing.push(m);
    mediaAdded = true;
  }
  if (mediaAdded) rawJson.capture.media = existing;

  const willStamp = opts.stampVersion && isCaptureTweetStale(rawJson);
  if (willStamp) {
    rawJson.captureTweetVersion = targetCaptureTweetVersion(rawJson);
  }

  if (!mediaAdded && !willStamp) return mediaAdded;

  await ports.persistSave(
    saveId,
    { rawJson },
    {
      actorReason: "pipeline:capture-tweet:quote-merge",
    },
  );
  return mediaAdded;
}

function parseTweetId(url: string): string | null {
  try {
    return new URL(url).pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function parsePostCode(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    return (
      path.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ??
      path.match(/\/t\/([A-Za-z0-9_-]+)/)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function quotedUrlFromCapture(rawJson: RawJson | null): string | undefined {
  return rawJson?.capture?.quoted?.url || undefined;
}

async function fillReplyParent<SaveRow extends CaptureTweetSave>(
  saveId: string,
  save: SaveRow,
  ports: CaptureTweetPorts<SaveRow>,
  signal?: AbortSignal,
): Promise<"enriched" | "transient" | "unavailable" | "unchanged"> {
  if (save.source !== "twitter" && save.source !== "threads") {
    return "unchanged";
  }
  const parentUrl = save.rawJson?.capture?.replyTo?.url;
  if (!parentUrl || parentUrl === save.url) return "unchanged";
  if (save.rawJson?.capture?.replyTo?.description) return "unchanged";
  const parentId =
    save.source === "threads"
      ? parsePostCode(parentUrl)
      : parseTweetId(parentUrl);
  if (!parentId) return "unchanged";
  const parent = await captureVariants(
    saveId,
    {
      url: parentUrl,
      sourceId: parentId,
      source: save.source,
      lightKind: "tweet_reply_parent_light",
      darkKind: "tweet_reply_parent_dark",
      lightFilename: "tweet-reply-parent-light.png",
      darkFilename: "tweet-reply-parent-dark.png",
      harvestMedia: true,
      persistScreenshots: false,
      signal,
    },
    ports,
  );
  if (signal?.aborted) return "unchanged";
  if (!parent.page) {
    if (
      parent.failureReason === "timeout" ||
      parent.failureReason === "navigate_failed" ||
      parent.failureReason === "auth_required" ||
      parent.failureReason === "capture_failed"
    ) {
      return "transient";
    }
    await markReplyParentUnavailable(saveId, save.rawJson, ports);
    return "unavailable";
  }
  const merged = await mergeReplyParent(
    saveId,
    save.rawJson,
    parent.page,
    ports,
  );
  return merged ? "enriched" : "unchanged";
}

async function markReplyParentUnavailable<SaveRow extends CaptureTweetSave>(
  saveId: string,
  stored: RawJson | null,
  ports: CaptureTweetPorts<SaveRow>,
): Promise<void> {
  if (!stored?.capture?.replyTo) return;
  const rawJson = structuredClone(stored);
  rawJson.capture.extras = {
    ...rawJson.capture.extras,
    replyParentUnavailable: true,
  };
  await ports.persistSave(
    saveId,
    { rawJson },
    { actorReason: "pipeline:capture-tweet:reply-parent-unavailable" },
  );
}

async function mergeReplyParent<SaveRow extends CaptureTweetSave>(
  saveId: string,
  stored: RawJson | null,
  parent: Capture,
  ports: CaptureTweetPorts<SaveRow>,
): Promise<boolean> {
  if (!stored?.capture?.replyTo) return false;
  const rawJson = structuredClone(stored);
  const replyTo = rawJson.capture?.replyTo;
  if (!replyTo) return false;
  if (parent.description) replyTo.description = parent.description;
  if (parent.title) replyTo.title = parent.title;
  if (parent.author) replyTo.author = parent.author;
  if (parent.publishedAt) replyTo.publishedAt = parent.publishedAt;
  if (parent.media.length > 0) replyTo.media = parent.media;
  if (parent.quoted) replyTo.quoted = parent.quoted;
  await ports.persistSave(
    saveId,
    { rawJson },
    { actorReason: "pipeline:capture-tweet:reply-parent" },
  );
  return true;
}
