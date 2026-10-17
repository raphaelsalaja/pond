import type { ImportCollection } from "@pond/schema/db";
import { session } from "electron";
import log from "electron-log/main.js";
import type { z } from "zod";
import { acquire, report } from "../../../pipeline/rate-governor";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import {
  BoardFeedResponseSchema,
  type BoardListResult,
  BoardsResponseSchema,
  boardFeedUrl,
  boardPinsPage,
  boardsPage,
  boardsUrl,
  collectBoards,
  type ResourceFailure,
  resourceFailure,
  walkBoards,
} from "./boards";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** Pinterest rejects resource calls with 403 "Invalid Resource Request" unless they name the page handler that would issue them. */
const BOARDS_HANDLER = "www/[username]/boards.js";
const BOARD_FEED_HANDLER = "www/[username]/[slug].js";

type ResourceResult<T> =
  | { ok: true; json: T }
  | { ok: false; reason: ResourceFailure };

export function listPinterestBoards(
  partition: string,
  username: string,
): Promise<BoardListResult> {
  return collectBoards(async (bookmark) => {
    const result = await fetchResource(
      partition,
      boardsUrl(username, bookmark),
      BOARDS_HANDLER,
      BoardsResponseSchema,
    );
    return result.ok ? { ok: true, page: boardsPage(result.json) } : result;
  });
}

export function harvestPinterestBoards(
  args: ListHarvestArgs,
  boards: readonly ImportCollection[],
  partition: string,
): Promise<ListHarvestResult> {
  return walkBoards(boards, args, async (boardId, bookmark) => {
    const result = await fetchResource(
      partition,
      boardFeedUrl(boardId, bookmark),
      BOARD_FEED_HANDLER,
      BoardFeedResponseSchema,
    );
    return result.ok ? { ok: true, page: boardPinsPage(result.json) } : result;
  });
}

async function fetchResource<
  T extends {
    resource_response: {
      status?: string | undefined;
      http_status?: number | undefined;
    };
  },
>(
  partition: string,
  url: string,
  handler: string,
  schema: z.ZodType<T>,
): Promise<ResourceResult<T>> {
  await acquire("pinterest");
  const ses = session.fromPartition(partition);
  const csrf = await csrfToken(partition);
  const headers = new Headers({
    accept: "application/json, text/javascript, */*; q=0.01",
    "x-requested-with": "XMLHttpRequest",
    "x-pinterest-appstate": "active",
    "x-pinterest-pws-handler": handler,
    referer: "https://www.pinterest.com/",
    "user-agent": CHROME_UA,
  });
  if (csrf) headers.set("x-csrftoken", csrf);
  let res: Response;
  try {
    res = await ses.fetch(url, { headers });
  } catch (err) {
    log.warn("[pond pinterest-resource] fetch threw", err);
    return { ok: false, reason: "unknown" };
  }
  report("pinterest", {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (!res.ok) return { ok: false, reason: "unknown" };
  let json: T;
  try {
    json = schema.parse(JSON.parse(await res.text()));
  } catch {
    return { ok: false, reason: "unknown" };
  }
  const failure = resourceFailure(json);
  if (failure === "rate_limited") {
    report("pinterest", { ok: false, rateLimited: true });
  }
  return failure ? { ok: false, reason: failure } : { ok: true, json };
}

async function csrfToken(partition: string): Promise<string | null> {
  try {
    const cookies = await session
      .fromPartition(partition)
      .cookies.get({ name: "csrftoken" });
    return cookies.find((cookie) => cookie.value.length > 0)?.value ?? null;
  } catch (err) {
    log.warn("[pond pinterest-resource] cookies.get failed", err);
    return null;
  }
}
