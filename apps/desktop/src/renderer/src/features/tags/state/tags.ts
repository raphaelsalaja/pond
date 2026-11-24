import { toMs } from "@shared/to-ms";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import { byName } from "@/shared/lib/sort";

export interface TagRow {
  id: string;
  name: string;
  starred: boolean;
  description: string | null;
  lastUsedAt: number | null;
  usageCount: number;
  createdAt: number | null;
}

interface TagsState {
  readonly rows: ReadonlyArray<TagRow>;
  readonly loaded: boolean;
}

const tagsStore = new Store<TagsState>({ rows: [], loaded: false });

let inflight: Promise<ReadonlyArray<TagRow>> | null = null;
let subscribed = false;

const Timestamp = z
  .union([z.number(), z.string(), z.date()])
  .nullish()
  .catch(null);

const TagRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  starred: z.coerce.boolean().catch(false),
  description: z.string().nullable().catch(null),
  lastUsedAt: Timestamp.transform(toMs),
  usageCount: z.number().catch(0),
  createdAt: Timestamp.transform(toMs),
});

const TagRowsSchema = z.array(TagRowSchema.nullable().catch(null));

const TagPatchSchema = TagRowSchema.partial().nullish().catch(null);

function setRows(rows: ReadonlyArray<TagRow>): void {
  tagsStore.setState(() => ({ rows, loaded: true }));
}

async function load(): Promise<ReadonlyArray<TagRow>> {
  if (tagsStore.state.loaded) {
    return tagsStore.state.rows;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    const rows = TagRowsSchema.parse(await window.pond.query("tags.list", {}));
    const normalised = rows.filter((r): r is TagRow => r !== null).sort(byName);
    setRows(normalised);
    inflight = null;
    return normalised;
  })();
  return inflight;
}

function ensureSubscribed(): void {
  if (subscribed) {
    return;
  }
  subscribed = true;
  window.pond.onSyncAction((event) => {
    if (event.modelName !== "tag") {
      return;
    }
    if (!tagsStore.state.loaded) {
      return;
    }

    const cache = tagsStore.state.rows;

    if (event.action === "I") {
      const inserted = TagRowSchema.safeParse(event.data);
      if (!inserted.success) {
        return;
      }
      const row = inserted.data;
      const idx = cache.findIndex((r) => r.id === row.id);
      const next = cache.slice();
      if (idx >= 0) {
        next[idx] = row;
      } else {
        next.push(row);
      }
      next.sort(byName);
      setRows(next);
      return;
    }

    if (event.action === "U") {
      const idx = cache.findIndex((r) => r.id === event.modelId);
      if (idx < 0) {
        return;
      }
      const existing = cache[idx];
      if (!existing) {
        return;
      }
      const merged = TagRowSchema.safeParse({
        ...existing,
        ...TagPatchSchema.parse(event.data),
        id: existing.id,
      });
      if (!merged.success) {
        return;
      }
      const next = cache.slice();
      next[idx] = merged.data;
      next.sort(byName);
      setRows(next);
      return;
    }

    if (event.action === "D") {
      const next = cache.filter((r) => r.id !== event.modelId);
      setRows(next);
      return;
    }
  });
}

export function useTags(): ReadonlyArray<TagRow> {
  useEffect(() => {
    ensureSubscribed();
    void load();
  }, []);
  return useSelector(tagsStore, (s) => s.rows);
}

export function useTagsLoaded(): boolean {
  return useSelector(tagsStore, (s) => s.loaded);
}
