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
import { harvestFailure } from "../../harvest-window/harvest";
import type { HarvestArgs, HarvestResult } from "../../harvest-window/harvest";
import { adapt } from "./item";
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
export function githubSessionGet(partition: string): GithubGet {
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
  accountId?: string | null;
  get?: GithubGet;
}): Promise<GithubRepoResult> {
  const get =
    args.get ??
    githubSessionGet(await partitionForIngest("github", args.accountId));
  let res: Response;
  try {
    res = await get(args.url);
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
  const html = await res.text();
  const page = parseRepoPage(html, res.url || args.url);
  if (!page) return { ok: false, reason: "no_repo" };
  const capture = adapt(page, {
    source: "github",
    url: args.url,
    sourceId: args.sourceId,
  });
  if (!capture) return { ok: false, reason: "no_repo" };
  return { ok: true, capture };
}

interface GithubCaptureDeps {
  githubGet?: GithubGet;
  partition?: string;
}

/**
 * GitHub server-renders everything the repo extractor reads into the initial
 * HTML, so a direct fetch answers first and the hidden browser only backs up
 * bot walls, transport failures, and page variants the parse cannot read.
 */
export async function captureGithubRepo(
  args: HarvestArgs,
  deps: GithubCaptureDeps,
  harvest: (args: HarvestArgs) => Promise<HarvestResult>,
): Promise<Capture> {
  const get =
    deps.githubGet ??
    githubSessionGet(
      deps.partition ?? (await partitionForIngest("github", args.accountId)),
    );
  const result = await fetchGithubRepoCapture({
    url: args.url,
    sourceId: args.sourceId ?? "",
    accountId: args.accountId,
    get,
  });

  if (result.ok) {
    /** Every repository serves at least GitHub's generated card, so a valid page with zero media is a partial read, not a finished harvest. */
    if (result.capture.media.length === 0) {
      throw new CaptureIncompleteError("github repo capture read no media");
    }
    return result.capture;
  }
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

  const fallback = await harvest(args);
  if (fallback.ok && fallback.capture) {
    if (fallback.capture.media.length === 0) {
      throw new CaptureIncompleteError("github repo capture read no media");
    }
    return fallback.capture;
  }
  throw harvestFailure("github", fallback.reason);
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
