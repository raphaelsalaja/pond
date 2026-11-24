import { sourceIdentity } from "@pond/schema/domain";
import { webTypeKey } from "@pond/schema/media-type";
import { onPoolDirty, pool } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import type { NlFacets } from "@/features/search/lib/nl-query";

function bump(map: Map<string, number>, key: string, delta: number): void {
  const next = (map.get(key) ?? 0) + delta;
  if (next <= 0) {
    map.delete(key);
  } else {
    map.set(key, next);
  }
}

function ranked(map: Map<string, number>): Array<string> {
  return Array.from(map, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((e) => e.value);
}

const sources = new Map<string, number>();
const tags = new Map<string, number>();
const types = new Map<string, number>();
const creators = new Map<string, number>();
const contributed = new Map<string, Save>();
let attached = false;
let cached: NlFacets | null = null;

function applySave(save: Save, sign: 1 | -1): void {
  if (save.deletedAt) {
    return;
  }
  const identity = sourceIdentity(save);
  if (identity) {
    bump(sources, identity, sign);
  }
  for (const tag of save.tags ?? []) {
    bump(tags, tag.toLowerCase(), sign);
  }
  const type =
    save.source === "web"
      ? webTypeKey(save)
      : (save.mediaType ?? "").toLowerCase();
  if (
    type === "image" ||
    type === "video" ||
    type === "link" ||
    type === "product" ||
    type === "text"
  ) {
    bump(types, type, sign);
  }
  const author = save.author?.trim();
  if (author) {
    bump(creators, author.toLowerCase(), sign);
  }
}

function rebuildFromPool(): void {
  sources.clear();
  tags.clear();
  types.clear();
  creators.clear();
  contributed.clear();
  for (const save of pool.snapshot()) {
    applySave(save, 1);
    contributed.set(save.id, save);
  }
  cached = null;
}

function patchIds(ids: ReadonlyArray<string>): void {
  for (const id of ids) {
    const prev = contributed.get(id);
    if (prev) {
      applySave(prev, -1);
    }
    const next = pool.get(id);
    if (next) {
      applySave(next, 1);
      contributed.set(id, next);
    } else {
      contributed.delete(id);
    }
  }
  cached = null;
}

function ensureAttached(): void {
  if (attached) {
    return;
  }
  attached = true;
  rebuildFromPool();
  onPoolDirty((ids) => {
    if (ids.length > 2000) {
      rebuildFromPool();
    } else {
      patchIds(ids);
    }
  });
}

export function computeLiveFacets(_saves?: ReadonlyArray<Save>): NlFacets {
  ensureAttached();
  if (cached) {
    return cached;
  }
  cached = {
    sources: ranked(sources),
    tags: ranked(tags),
    types: ranked(types),
    creators: ranked(creators),
  };
  return cached;
}
