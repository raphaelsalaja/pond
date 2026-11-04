/// <reference lib="dom" />

import type { CollectionsReply } from "../lib/collections-reply";

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
  status?: string;
}

export function buildInstagramCollectionsExpression(): string {
  return `(async () => {
    try { return await (${inPageInstagramCollections.toString()})(); }
    catch (e) { return { ok: false, reason: 'unknown', detail: String((e && e.message) || e).slice(0, 200) }; }
  })()`;
}

/** Lists the collections you made; the automatic "All posts" collection is the saved list itself. */
async function inPageInstagramCollections(): Promise<CollectionsReply> {
  const collections: Array<{ id: string; name: string; count: number | null }> =
    [];
  let cursor: string | null = null;
  /** www answers this endpoint with its HTML not-found page for some accounts; the API host still serves it to the web session. */
  let origin = "";
  const list = (params: URLSearchParams) =>
    fetch(`${origin}/api/v1/collections/list/?${params}`, {
      credentials: "include",
      headers: {
        "x-ig-app-id": "936619743392459",
        "x-asbd-id": "129477",
        "x-requested-with": "XMLHttpRequest",
        accept: "*/*",
      },
    });
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      collection_types: JSON.stringify(["MEDIA"]),
      include_public_only: "0",
    });
    if (cursor) params.set("max_id", cursor);
    let res = await list(params);
    if (res.status === 404 && origin === "") {
      origin = "https://i.instagram.com";
      res = await list(params);
    }
    const json: CollectionsPage | null = await res.json().catch(() => null);
    const message = json?.message ?? "";
    /** Instagram answers 400 with one of these until you clear the prompt on instagram.com. */
    if (/^(checkpoint|challenge|consent)_required$/.test(message)) {
      return { ok: false, reason: "checkpoint", detail: message };
    }
    if (
      res.status === 401 ||
      res.status === 403 ||
      json?.require_login ||
      message === "login_required"
    ) {
      return { ok: false, reason: "auth_required" };
    }
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok || !json || json.status === "fail") {
      const type = res.headers.get("content-type") ?? "";
      return {
        ok: false,
        reason: "unknown",
        detail: `${res.status} ${message || type}`.trim().slice(0, 200),
      };
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
