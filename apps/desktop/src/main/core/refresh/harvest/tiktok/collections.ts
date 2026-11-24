/// <reference lib="dom" />

import type { ImportCollection } from "@pond/schema/db";
import type { CollectionsReply } from "../lib/collections-reply";

/** TikTok routes collections as `/@:uniqueId/collection/:title(.+)-:id`; the title is display-only. */
export function tiktokCollectionUrl(
  handle: string,
  collection: ImportCollection,
): string {
  const title = collection.name.trim() || "collection";
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}/collection/${encodeURIComponent(title)}-${encodeURIComponent(collection.id)}`;
}

export function buildTiktokCollectionsExpression(): string {
  return `(async () => {
    try { return await (${inPageTiktokCollections.toString()})(); }
    catch (e) { return { ok: false, reason: 'unknown' }; }
  })()`;
}

/** Reads the collection cards under Favorites on your profile. */
async function inPageTiktokCollections(): Promise<CollectionsReply> {
  if (location.pathname.startsWith("/login")) {
    return { ok: false, reason: "auth_required" };
  }
  const wait = (ms: number) =>
    new Promise((r) => {
      setTimeout(r, ms);
    });
  const find = async (
    selector: string,
    timeoutMs: number,
  ): Promise<HTMLElement | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        return found;
      }
      await wait(250);
    }
    return null;
  };

  const favorites = await find('[data-e2e="favorites-tab"]', 10_000);
  if (!favorites) {
    return { ok: false, reason: "unknown" };
  }
  favorites.click();
  const section = await find('[data-e2e="sub-tab-collections"]', 8000);
  if (!section) {
    return { ok: true, collections: [] };
  }
  /** The section switcher changes tab on focus, not click. */
  section.focus();
  section.click();

  const CARD = '[data-e2e="collection-list-item"]';
  await find(CARD, 6000);
  let last = -1;
  let stable = 0;
  for (let round = 0; round < 40 && stable < 3; round++) {
    const count = document.querySelectorAll(CARD).length;
    if (count === last) {
      stable += 1;
    } else {
      stable = 0;
      last = count;
    }
    window.scrollTo(0, document.body.scrollHeight);
    await wait(700);
  }

  const collections: Array<{ id: string; name: string; count: number | null }> =
    [];
  const seen = new Set<string>();
  for (const card of Array.from(document.querySelectorAll(CARD))) {
    const link = card.querySelector<HTMLAnchorElement>(
      'a[href*="/collection/"]',
    );
    if (!link) {
      continue;
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(link.href, location.origin).pathname);
    } catch {
      continue;
    }
    const match = /\/collection\/(.+)-(\d+)\/?$/.exec(path);
    const title = match?.[1];
    const id = match?.[2];
    if (!title || !id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const labels = card.querySelectorAll(
      '[data-e2e="collection-card-footer"] span',
    );
    const digits = (labels[1]?.textContent ?? "").replaceAll(/\D/g, "");
    collections.push({
      id,
      name: labels[0]?.textContent?.trim() || title,
      count: digits ? Number(digits) : null,
    });
  }
  return { ok: true, collections };
}
