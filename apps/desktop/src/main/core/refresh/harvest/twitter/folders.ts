/// <reference lib="dom" />

import { isJsonValue } from "@pond/schema/json";
import type { JsonObject, JsonValue } from "@pond/schema/json";
import type { ImportCollectionOption } from "@shared/import-scope";
import { z } from "zod";

export const TWITTER_BOOKMARKS_URL = "https://x.com/i/bookmarks";

declare global {
  var __pondBookmarkFoldersCaptures: Array<{ body?: string }> | undefined;
}

/** X's folder page often fails when loaded by URL but renders when the open bookmarks page routes to it. */
export function buildOpenBookmarkFolderExpression(folderId: string): string {
  return `(${inPageOpenBookmarkFolder.toString()})(${JSON.stringify(folderId)})`;
}

async function inPageOpenBookmarkFolder(folderId: string): Promise<boolean> {
  const sleep = (ms: number): Promise<void> =>
    new Promise((r) => {
      setTimeout(r, ms);
    });
  const mountDeadline = Date.now() + 15_000;
  while (
    !globalThis.__pondBookmarksCaptures?.length &&
    Date.now() < mountDeadline
  ) {
    await sleep(250);
  }
  /** x-web dropped the `primaryColumn` test id; its timeline renders inside `main`. */
  if (!document.querySelector('[data-testid="primaryColumn"], main')) {
    return false;
  }
  globalThis.__pondBookmarkFolderRequest = null;
  /** The main list shares this buffer, and its posts must not be filed into the folder. */
  globalThis.__pondBookmarksCaptures = [];
  const base = location.pathname.startsWith("/i/history")
    ? "/i/history/bookmarks/"
    : "/i/bookmarks/";
  history.pushState({}, "", base + encodeURIComponent(folderId));
  dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  /** Only the folder's own request proves the view switched; otherwise a scroll would read the main list. */
  const requestDeadline = Date.now() + 20_000;
  while (!globalThis.__pondBookmarkFolderRequest) {
    if (Date.now() > requestDeadline) {
      return false;
    }
    await sleep(250);
  }
  return true;
}

/** The bookmarks page asks for your folders as it loads; accounts without folders never send the request. */
export function buildReadBookmarkFoldersExpression(): string {
  return `(${inPageReadBookmarkFolders.toString()})()`;
}

async function inPageReadBookmarkFolders(): Promise<Array<string>> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const captures = globalThis.__pondBookmarkFoldersCaptures ?? [];
    if (captures.length > 0) {
      return captures.flatMap((capture) =>
        capture.body ? [capture.body] : [],
      );
    }
    await new Promise((r) => {
      setTimeout(r, 300);
    });
  }
  return [];
}

const FolderSchema = z
  .object({ id: z.string().min(1), name: z.string().catch("") })
  .nullable()
  .catch(null);

const SliceSchema = z
  .object({ items: z.array(FolderSchema).catch([]) })
  .catch({ items: [] });

const BodiesSchema = z.array(z.string()).catch([]);

export function parseBookmarkFolders(
  value: JsonValue,
): Array<ImportCollectionOption> {
  const out: Array<ImportCollectionOption> = [];
  const seen = new Set<string>();
  for (const body of BodiesSchema.parse(value)) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    if (!isJsonValue(json)) {
      continue;
    }
    for (const slice of findKey(json, "bookmark_collections_slice")) {
      for (const folder of SliceSchema.parse(slice).items) {
        if (!folder || seen.has(folder.id)) {
          continue;
        }
        seen.add(folder.id);
        out.push({
          id: folder.id,
          name: folder.name || folder.id,
          itemCount: null,
        });
      }
    }
  }
  return out;
}

function findKey(value: JsonValue, key: string): Array<JsonValue> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => findKey(item, key));
  }
  if (!isJsonObject(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([name, child]) =>
    name === key ? [child] : findKey(child, key),
  );
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return Object(value) === value;
}
