import type { Capture } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import { acquire, report } from "../../../pipeline/rate-governor";
import { partitionForIngest } from "../../../sync/accounts";
import { browserUserAgent } from "../../harvest-window/constants";
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
