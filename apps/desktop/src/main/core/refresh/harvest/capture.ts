import type { Source } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { sourceLabel } from "@pond/schema/sources";
import type { ReportDownloadActivity } from "@shared/download-activity";
import {
  AuthRequiredError,
  TerminalError,
  TransientError,
} from "../../pipeline/extractors/errors";
import { partitionForIngest } from "../../sync/accounts";
import {
  type HarvestArgs,
  type HarvestResult,
  harvestUrl,
} from "../harvest-window/harvest";
import {
  fetchPinterestCapture,
  type PinterestCaptureResult,
  type PinterestGet,
  pinterestSessionGet,
} from "./pinterest/api";

interface CaptureArgs {
  url: string;
  source: Source;
  sourceId?: string;
  accountId?: string | null;
  reportActivity?: ReportDownloadActivity;
  isSignedIn?: (source: Source, partition: string) => Promise<boolean>;
  signal?: AbortSignal;
}

interface CaptureDeps {
  harvest?: (args: HarvestArgs) => Promise<HarvestResult>;
  fetchPinterest?: (args: {
    sourceId: string;
    get?: PinterestGet;
  }) => Promise<PinterestCaptureResult>;
  anonymousGet?: PinterestGet;
  signedGet?: PinterestGet;
  partition?: string;
}

export async function captureFromSource(
  args: CaptureArgs,
  deps: CaptureDeps = {},
): Promise<Capture> {
  if (args.source === "web" || args.source === "local") {
    throw new TerminalError(
      `${args.source} does not harvest via captureFromSource`,
    );
  }

  const harvest = deps.harvest ?? harvestUrl;
  const fetchPin = deps.fetchPinterest ?? fetchPinterestCapture;

  if (args.source === "pinterest" && args.sourceId) {
    const recovered = await capturePinterestPin(args, deps, harvest, fetchPin);
    if (recovered) return recovered;
  }

  if (args.source === "arena" && args.sourceId) {
    const { fetchArenaCapture } = await import("./arena/api");
    const result = await fetchArenaCapture({
      sourceId: args.sourceId,
      signal: args.signal,
    });
    if (result.ok) return result.capture;
    /** A Link block's Save URL is the page it links to; the page harvest reads the block. */
    const blockUrl = `https://www.are.na/block/${args.sourceId}`;
    const fallback = await harvest({ ...args, url: blockUrl });
    if (fallback.ok && fallback.capture) return fallback.capture;
    throw harvestFailure(args.source, fallback.reason);
  }

  if (args.source === "substack" && args.sourceId) {
    const { fetchSubstackCapture } = await import("./substack/api");
    const result = await fetchSubstackCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "tumblr" && args.sourceId) {
    const { fetchTumblrCapture } = await import("./tumblr/api");
    const result = await fetchTumblrCapture({
      sourceId: args.sourceId,
      url: args.url,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "savee" && args.sourceId) {
    const { fetchSaveeCapture } = await import("./savee/api");
    const result = await fetchSaveeCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
  }

  if (args.source === "vimeo" && args.sourceId) {
    const { fetchVimeoCapture } = await import("./vimeo/api");
    const result = await fetchVimeoCapture({
      sourceId: args.sourceId,
      accountId: args.accountId ?? null,
    });
    if (result.ok) return result.capture;
    if (result.reason === "not_found") {
      throw new TerminalError("vimeo video is gone or blocked in your region");
    }
    throw new TransientError("vimeo api unavailable");
  }

  if (args.source === "bluesky" && args.sourceId) {
    const { fetchBlueskyCapture } = await import("./bluesky/api");
    const result = await fetchBlueskyCapture({
      sourceId: args.sourceId,
      url: args.url,
    });
    if (result.ok) return result.capture;
    if (result.reason === "not_found") {
      throw new TerminalError("bluesky post was deleted or hidden");
    }
  }

  const result = await harvest(args);
  if (result.ok && result.capture) return result.capture;
  throw harvestFailure(args.source, result.reason);
}

/** Logged-out PinNotFound is not deletion; only a signed-in pin page that still says PinNotFound is terminal. */
async function capturePinterestPin(
  args: CaptureArgs,
  deps: CaptureDeps,
  harvest: (args: HarvestArgs) => Promise<HarvestResult>,
  fetchPin: (args: {
    sourceId: string;
    get?: PinterestGet;
  }) => Promise<PinterestCaptureResult>,
): Promise<Capture | null> {
  const sourceId = args.sourceId;
  if (!sourceId) return null;

  const anonymous = await fetchPin({ sourceId, get: deps.anonymousGet });
  if (anonymous.ok && hasMedia(anonymous.capture)) return anonymous.capture;

  const partition =
    deps.partition ?? (await partitionForIngest("pinterest", args.accountId));
  const signedIn = args.isSignedIn
    ? await args.isSignedIn("pinterest", partition)
    : deps.signedGet !== undefined;

  let signed: PinterestCaptureResult | null = null;
  if (signedIn) {
    signed = await fetchPin({
      sourceId,
      get: deps.signedGet ?? pinterestSessionGet(partition),
    });
    if (signed.ok && hasMedia(signed.capture)) return signed.capture;
  }

  const result = await harvest(args);
  if (result.ok && result.capture && hasMedia(result.capture)) {
    return result.capture;
  }
  if (
    signedIn &&
    signed?.ok === false &&
    signed.reason === "not_found" &&
    result.reason === "harvest_failed"
  ) {
    throw new TerminalError("pinterest item no longer exists");
  }
  if (result.reason === "harvest_failed" || result.reason === undefined) {
    throw new TransientError("pinterest harvest returned no data");
  }
  throw harvestFailure(args.source, result.reason);
}

function hasMedia(capture: Capture): boolean {
  return capture.media.length > 0;
}

function harvestFailure(
  source: Source,
  reason: HarvestResult["reason"],
): AuthRequiredError | TransientError | TerminalError {
  switch (reason) {
    case "auth_required":
      return new AuthRequiredError(
        `Connect ${sourceLabel(source)} with the Pond extension`,
        source,
      );
    case "navigate_failed":
      return new TransientError("navigate failed");
    case "timeout":
      return new TransientError("scrape timeout");
    default:
      return new TerminalError("scrape returned no data");
  }
}
