/// <reference lib="dom" />

import type { JsonValue } from "@pond/schema/json";
import type { ImportCollectionOption } from "@shared/import-scope";
import { z } from "zod";

interface CollectionsPage {
  items?: Array<{
    collection_id?: string | number;
    collection_name?: string;
    collection_type?: string;
    collection_media_count?: number;
  }>;
  more_available?: boolean;
  next_max_id?: string | number;
  require_login?: boolean;
  message?: string;
}

type CollectionsReply =
  | {
      ok: true;
      collections: Array<{ id: string; name: string; count: number | null }>;
    }
  | { ok: false; reason: "auth_required" | "rate_limited" | "unknown" };

export function buildInstagramCollectionsExpression(): string {
  return `(async () => {
    try { return await (${inPageInstagramCollections.toString()})(); }
    catch (e) { return { ok: false, reason: 'unknown' }; }
  })()`;
}

/** Lists the collections you made; the automatic "All posts" collection is the saved list itself. */
async function inPageInstagramCollections(): Promise<CollectionsReply> {
  const collections: Array<{ id: string; name: string; count: number | null }> =
    [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      collection_types: JSON.stringify(["MEDIA"]),
      include_public_only: "0",
    });
    if (cursor) params.set("max_id", cursor);
    const res = await fetch(`/api/v1/collections/list/?${params}`, {
      credentials: "include",
      headers: {
        "x-ig-app-id": "936619743392459",
        "x-asbd-id": "129477",
        "x-requested-with": "XMLHttpRequest",
        accept: "*/*",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    const json: CollectionsPage = await res.json();
    if (json.require_login || json.message === "login_required") {
      return { ok: false, reason: "auth_required" };
    }
    for (const item of json.items ?? []) {
      if (item.collection_id === undefined) continue;
      if (item.collection_type && item.collection_type !== "MEDIA") continue;
      collections.push({
        id: String(item.collection_id),
        name: item.collection_name ?? "",
        count: item.collection_media_count ?? null,
      });
    }
    if (!json.more_available || json.next_max_id === undefined) break;
    cursor = String(json.next_max_id);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: true, collections };
}

const ReplySchema = z
  .union([
    z.object({
      ok: z.literal(true),
      collections: z
        .array(
          z.object({
            id: z.string().min(1),
            name: z.string().catch(""),
            count: z.number().nullable().catch(null),
          }),
        )
        .catch([]),
    }),
    z.object({
      ok: z.literal(false),
      reason: z
        .enum(["auth_required", "rate_limited", "unknown"])
        .catch("unknown"),
    }),
  ])
  .catch({ ok: false, reason: "unknown" });

export function readInstagramCollections(
  value: JsonValue,
):
  | { ok: true; collections: ImportCollectionOption[] }
  | { ok: false; reason: "auth_required" | "rate_limited" | "unknown" } {
  const reply = ReplySchema.parse(value);
  if (!reply.ok) return reply;
  return {
    ok: true,
    collections: reply.collections.map((collection) => ({
      id: collection.id,
      name: collection.name || collection.id,
      itemCount: collection.count,
    })),
  };
}
