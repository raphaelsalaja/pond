/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { ImportCollectionOption } from "@shared/import-scope";
import { z } from "zod";

export const TWITTER_BOOKMARKS_URL = "https://x.com/i/bookmarks";

declare global {
  var __pondBookmarkFoldersCaptures: Array<{ body?: string }> | undefined;
}

export function twitterBookmarkFolderUrl(folderId: string): string {
  return `${TWITTER_BOOKMARKS_URL}/${encodeURIComponent(folderId)}`;
}

/** The bookmarks page asks for your folders as it loads; accounts without folders never send the request. */
export function buildReadBookmarkFoldersExpression(): string {
  return `(${inPageReadBookmarkFolders.toString()})()`;
}

async function inPageReadBookmarkFolders(): Promise<string[]> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const captures = globalThis.__pondBookmarkFoldersCaptures ?? [];
    if (captures.length > 0) {
      return captures.flatMap((capture) =>
        capture.body ? [capture.body] : [],
      );
    }
    await new Promise((r) => setTimeout(r, 300));
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
): ImportCollectionOption[] {
  const out: ImportCollectionOption[] = [];
  const seen = new Set<string>();
  for (const body of BodiesSchema.parse(value)) {
    let json: JsonValue;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    for (const slice of findKey(json, "bookmark_collections_slice")) {
      for (const folder of SliceSchema.parse(slice).items) {
        if (!folder || seen.has(folder.id)) continue;
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

function findKey(value: JsonValue, key: string): JsonValue[] {
  if (Array.isArray(value)) return value.flatMap((item) => findKey(item, key));
  if (!(value instanceof Object)) return [];
  return Object.entries(value).flatMap(([name, child]) =>
    name === key ? [child] : findKey(child, key),
  );
}
