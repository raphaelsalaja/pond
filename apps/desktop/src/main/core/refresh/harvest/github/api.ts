import type { Capture } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import {
  CaptureIncompleteError,
  RateLimitedError,
  TerminalError,
  TransientError,
} from "../../../pipeline/extractors/errors";
import { acquire, report } from "../../../pipeline/rate-governor";
import { partitionForIngest } from "../../../sync/accounts";
import { browserUserAgent } from "../../harvest-window/constants";
import { harvestFailure, readHarvestPage } from "../../harvest-window/harvest";
import type { HarvestArgs, PageReadResult } from "../../harvest-window/harvest";
import { adapt, buildPageExpression, RepoPageHtmlSchema } from "./item";
import { parseRepoPage } from "./page";

const FETCH_TIMEOUT_MS = 15_000;

/** One GET of repository HTML, so tests can answer for the network. */
export type GithubGet = (url: string) => Promise<Response>;

export type GithubRepoResult =
  | { ok: true; capture: Capture }
  | {
      ok: false;
      reason:
        | "not_found"
        | "blocked"
        | "rate_limited"
        | "server_error"
        | "client_error"
        | "no_repo"
        | "fetch_failed";
      status?: number;
      retryAfterSec?: number;
    };

/** Direct reads bypass the harvest window pool, so the session transport gates and reports itself. */
function githubSessionGet(partition: string): GithubGet {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return async (url) => {
    await acquire("github");
    try {
      const res = await ses.fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": ua,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      report("github", {
        ok: res.ok,
        status: res.status,
        headers: res.headers,
      });
      return res;
    } catch (error) {
      report("github", { ok: false });
      throw error;
    }
  };
}

export async function fetchGithubRepoCapture(args: {
  url: string;
  sourceId: string;
  get: GithubGet;
}): Promise<GithubRepoResult> {
  let res: Response;
  try {
    res = await args.get(args.url);
  } catch (error) {
    log.warn("[pond github-api] fetch threw", args.url, error);
    return { ok: false, reason: "fetch_failed" };
  }
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (res.status === 403) return { ok: false, reason: "blocked" };
  if (res.status === 429) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSec: parseRetryAfter(res.headers.get("retry-after")),
    };
  }
  if (res.status >= 500) {
    return { ok: false, reason: "server_error", status: res.status };
  }
  if (!res.ok) {
    return { ok: false, reason: "client_error", status: res.status };
  }
  const capture = captureFromHtml(await res.text(), res.url || args.url, args);
  if (!capture) return { ok: false, reason: "no_repo" };
  return { ok: true, capture };
}

function captureFromHtml(
  html: string,
  pageUrl: string,
  args: { url: string; sourceId: string },
): Capture | null {
  const page = parseRepoPage(html, pageUrl);
  if (!page) return null;
  return adapt(page, {
    source: "github",
    url: args.url,
    sourceId: args.sourceId,
  });
}

/** Reads a page in a harvest window, so tests can answer for the browser. */
export type GithubPageReader = (
  args: HarvestArgs,
  expression: (sourceId: string) => string,
) => Promise<PageReadResult>;

interface GithubCaptureArgs extends HarvestArgs {
  sourceId: string;
  /** The harvest task's last try keeps a medialess Capture rather than failing the Save. */
  finalAttempt?: boolean;
}

interface GithubCaptureDeps {
  githubGet?: GithubGet;
  readPage?: GithubPageReader;
  partition?: string;
}

/**
 * GitHub server-renders everything the repo extractor reads into the initial
 * HTML, so a direct fetch answers first and the hidden browser only backs up
 * bot walls, transport failures, and page variants the parse cannot read.
 * Both transports go through `parseRepoPage`.
 */
export async function captureGithubRepo(
  args: GithubCaptureArgs,
  deps: GithubCaptureDeps,
): Promise<Capture> {
  const get =
    deps.githubGet ??
    githubSessionGet(
      deps.partition ?? (await partitionForIngest("github", args.accountId)),
    );
  const result = await fetchGithubRepoCapture({
    url: args.url,
    sourceId: args.sourceId,
    get,
  });

  if (result.ok) return withMedia(result.capture, args);
  if (result.reason === "not_found") {
    throw new TerminalError("github repository is gone or private");
  }
  if (result.reason === "rate_limited") {
    throw new RateLimitedError(result.retryAfterSec, "github fetch 429");
  }
  if (result.reason === "server_error") {
    throw new TransientError(`github fetch ${result.status ?? 500}`);
  }
  if (result.reason === "client_error") {
    throw new TerminalError(`github fetch ${result.status ?? 400}`);
  }

  const page = await (deps.readPage ?? readHarvestPage)(
    args,
    buildPageExpression,
  );
  if (!page.ok) throw harvestFailure("github", page.reason);
  const parsed = RepoPageHtmlSchema.safeParse(page.raw);
  const capture = parsed.success
    ? captureFromHtml(parsed.data.html, parsed.data.url || args.url, args)
    : null;
  if (!capture) throw harvestFailure("github", "harvest_failed");
  return withMedia(capture, args);
}

/**
 * Every repository serves at least GitHub's generated card, so a valid page
 * with zero media is a partial read: retry it, and on the last attempt keep the
 * README and About text so the Save still completes with a text cover.
 */
function withMedia(capture: Capture, args: GithubCaptureArgs): Capture {
  if (capture.media.length > 0 || args.finalAttempt) return capture;
  throw new CaptureIncompleteError("github repo capture read no media");
}

/** Retry-After is either delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return undefined;
}
