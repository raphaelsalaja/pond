import type { ImportCollection } from "@pond/schema/db";
import { z } from "zod";
import { addCollectionEntry } from "../collection-entries";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";

export interface PinterestBoard extends ImportCollection {
  pinCount: number | null;
}

export interface ResourcePage<T> {
  items: T[];
  bookmark: string | null;
}

export type ResourceFailure = "auth_required" | "rate_limited" | "unknown";

export type ResourcePageResult<T> =
  | { ok: true; page: ResourcePage<T> }
  | { ok: false; reason: ResourceFailure };

interface BoardsOptions {
  username: string;
  page_size: number;
  privacy_filter: "all";
  sort: "last_pinned_to";
  field_set_key: "profile_grid_item";
  filter_stories: boolean;
  include_archived: boolean;
  bookmarks?: string[];
}

interface BoardFeedOptions {
  board_id: string;
  page_size: number;
  bookmarks?: string[];
}

const PAGE_SIZE = 50;
const MAX_BOARD_LIST_PAGES = 20;
const MAX_PAGES_PER_BOARD = 100;
/** Matches the Cosmos walk: two pages of known pins in a row mean the rest of the board is already in the Library. */
const KNOWN_PAGE_STREAK_STOP = 2;

const OptionalText = z.string().optional().catch(undefined);
const OptionalCount = z.number().optional().catch(undefined);

const BookmarksSchema = z
  .object({
    options: z
      .object({
        bookmarks: z.array(z.string()).optional().catch(undefined),
      })
      .catch({}),
  })
  .optional()
  .catch(undefined);

const BoardSchema = z
  .object({
    id: OptionalText,
    name: OptionalText,
    type: OptionalText,
    pin_count: OptionalCount,
  })
  .nullable()
  .catch(null);

export const BoardsResponseSchema = z
  .object({
    resource_response: z
      .object({
        status: OptionalText,
        http_status: OptionalCount,
        data: z.array(BoardSchema).catch([]),
        bookmark: OptionalText,
      })
      .catch({ data: [] }),
    resource: BookmarksSchema,
  })
  .catch({ resource_response: { data: [] } });

const PinSchema = z
  .object({ id: OptionalText, type: OptionalText })
  .nullable()
  .catch(null);

const PinListSchema = z.array(PinSchema);

export const BoardFeedResponseSchema = z
  .object({
    resource_response: z
      .object({
        status: OptionalText,
        http_status: OptionalCount,
        data: z
          .union([PinListSchema, z.object({ results: PinListSchema })])
          .catch([]),
        bookmark: OptionalText,
      })
      .catch({ data: [] }),
    resource: BookmarksSchema,
  })
  .catch({ resource_response: { data: [] } });

/** Pinterest can answer 200 with a failure envelope, so the envelope status decides as well as the HTTP status. */
export function resourceFailure(response: {
  resource_response: {
    status?: string | undefined;
    http_status?: number | undefined;
  };
}): ResourceFailure | null {
  const { status, http_status: httpStatus } = response.resource_response;
  if (status !== "failure") return null;
  if (httpStatus === 401 || httpStatus === 403) return "auth_required";
  if (httpStatus === 429) return "rate_limited";
  return "unknown";
}

/** Pinterest marks the last page with `-end-`, or with a base64 `cbNone;` bookmark on some feeds. */
function nextBookmark(
  responseBookmark: string | undefined,
  optionBookmarks: string[] | undefined,
): string | null {
  const bookmark = responseBookmark ?? optionBookmarks?.[0];
  if (!bookmark || bookmark === "-end-" || bookmark.startsWith("Y2JOb25lO")) {
    return null;
  }
  return bookmark;
}

export function boardsPage(
  response: z.infer<typeof BoardsResponseSchema>,
): ResourcePage<PinterestBoard> {
  const items: PinterestBoard[] = [];
  for (const board of response.resource_response.data) {
    if (!board?.id || !board.name) continue;
    if (board.type && board.type !== "board") continue;
    items.push({
      id: board.id,
      name: board.name,
      pinCount: board.pin_count ?? null,
    });
  }
  return {
    items,
    bookmark: nextBookmark(
      response.resource_response.bookmark,
      response.resource?.options.bookmarks,
    ),
  };
}

export function boardPinsPage(
  response: z.infer<typeof BoardFeedResponseSchema>,
): ResourcePage<ListEntry> {
  const data = response.resource_response.data;
  const pins = Array.isArray(data) ? data : data.results;
  const items: ListEntry[] = [];
  for (const pin of pins) {
    if (!pin?.id || !/^\d+$/.test(pin.id)) continue;
    if (pin.type && pin.type !== "pin") continue;
    items.push({
      sourceId: pin.id,
      url: `https://www.pinterest.com/pin/${pin.id}/`,
    });
  }
  return {
    items,
    bookmark: nextBookmark(
      response.resource_response.bookmark,
      response.resource?.options.bookmarks,
    ),
  };
}

export function boardsUrl(username: string, bookmark: string | null): string {
  const options: BoardsOptions = {
    username,
    page_size: PAGE_SIZE,
    privacy_filter: "all",
    sort: "last_pinned_to",
    field_set_key: "profile_grid_item",
    filter_stories: false,
    include_archived: true,
  };
  if (bookmark) options.bookmarks = [bookmark];
  return resourceUrl(
    "Boards",
    options,
    `/${encodeURIComponent(username)}/boards/`,
  );
}

export function boardFeedUrl(boardId: string, bookmark: string | null): string {
  const options: BoardFeedOptions = { board_id: boardId, page_size: PAGE_SIZE };
  if (bookmark) options.bookmarks = [bookmark];
  return resourceUrl("BoardFeed", options, "/");
}

function resourceUrl(
  resource: "Boards" | "BoardFeed",
  options: BoardsOptions | BoardFeedOptions,
  sourceUrl: string,
): string {
  const params = new URLSearchParams({
    source_url: sourceUrl,
    data: JSON.stringify({ options, context: {} }),
  });
  return `https://www.pinterest.com/resource/${resource}Resource/get/?${params.toString()}`;
}

export type BoardListResult =
  | { ok: true; boards: PinterestBoard[] }
  | { ok: false; reason: ResourceFailure };

export async function collectBoards(
  fetchPage: (
    bookmark: string | null,
  ) => Promise<ResourcePageResult<PinterestBoard>>,
): Promise<BoardListResult> {
  const boards = new Map<string, PinterestBoard>();
  let bookmark: string | null = null;
  for (let page = 0; page < MAX_BOARD_LIST_PAGES; page++) {
    const result = await fetchPage(bookmark);
    if (!result.ok) {
      if (page === 0) return result;
      break;
    }
    for (const board of result.page.items) boards.set(board.id, board);
    if (!result.page.bookmark) break;
    bookmark = result.page.bookmark;
  }
  return { ok: true, boards: Array.from(boards.values()) };
}

export async function walkBoards(
  boards: readonly ImportCollection[],
  args: ListHarvestArgs,
  fetchPage: (
    boardId: string,
    bookmark: string | null,
  ) => Promise<ResourcePageResult<ListEntry>>,
): Promise<ListHarvestResult> {
  const known = new Set(args.knownIds.map(String));
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const entries = new Map<string, ListEntry>();
  let reachedEnd = true;

  for (const board of boards) {
    let bookmark: string | null = null;
    let knownStreak = 0;
    let boardEnded = false;
    for (let page = 0; page < MAX_PAGES_PER_BOARD; page++) {
      const result = await fetchPage(board.id, bookmark);
      if (!result.ok) {
        if (result.reason !== "unknown") {
          return { ok: false, reason: result.reason };
        }
        /** A board you deleted on Pinterest fails on its first page; skipping it keeps the other boards syncing. */
        boardEnded = page === 0;
        break;
      }
      let fresh = 0;
      for (const entry of result.page.items) {
        if (!known.has(entry.sourceId)) fresh += 1;
        addCollectionEntry(entries, entry.sourceId, entry, board.id);
      }
      if (earlyStop && result.page.items.length > 0 && fresh === 0) {
        knownStreak += 1;
        if (knownStreak >= KNOWN_PAGE_STREAK_STOP) {
          boardEnded = true;
          break;
        }
      } else {
        knownStreak = 0;
      }
      if (!result.page.bookmark) {
        boardEnded = true;
        break;
      }
      bookmark = result.page.bookmark;
    }
    if (!boardEnded) reachedEnd = false;
  }

  return {
    ok: true,
    entries: Array.from(entries.values()),
    reachedEnd,
    seen: entries.size,
  };
}
