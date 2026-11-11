import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import { bySortOrderThenName } from "@/shared/lib/sort";

export interface TagGroupRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  collapsed: boolean;
  tagIds: string[];
  tagNames: string[];
}

interface TagGroupsState {
  readonly rows: ReadonlyArray<TagGroupRow>;
  readonly loaded: boolean;
}

const tagGroupsStore = new Store<TagGroupsState>({
  rows: [],
  loaded: false,
});

const TagGroupRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable().catch(null),
  color: z.string().nullable().catch(null),
  sortOrder: z.number().catch(0),
  collapsed: z.coerce.boolean(),
  tagIds: z.array(z.string()).catch([]),
  tagNames: z.array(z.string()).catch([]),
});

const TagGroupRowsSchema = z.array(TagGroupRowSchema.nullable().catch(null));

const TagGroupPatchSchema = TagGroupRowSchema.partial().nullish().catch(null);

let inflight: Promise<ReadonlyArray<TagGroupRow>> | null = null;
let subscribed = false;

function sortGroups(rows: ReadonlyArray<TagGroupRow>): TagGroupRow[] {
  return rows.slice().sort(bySortOrderThenName);
}

function setRows(rows: ReadonlyArray<TagGroupRow>): void {
  tagGroupsStore.setState(() => ({ rows: sortGroups(rows), loaded: true }));
}

async function load(): Promise<ReadonlyArray<TagGroupRow>> {
  if (tagGroupsStore.state.loaded) return tagGroupsStore.state.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    const rows = TagGroupRowsSchema.parse(
      await window.pond.query("tagGroups.list", {}),
    );
    const normalised = rows.filter((r): r is TagGroupRow => r !== null);
    setRows(normalised);
    inflight = null;
    return tagGroupsStore.state.rows;
  })();
  return inflight;
}

let refetchScheduled = false;
function scheduleRefetch(): void {
  if (refetchScheduled) return;
  refetchScheduled = true;
  queueMicrotask(() => {
    refetchScheduled = false;
    void (async () => {
      // Keep the current rows until the refetched ones arrive. Membership
      // changes (adding a tag to a group) refetch the list, and clearing it
      // here made every view that keys off a group id think the group was
      // gone and fall back to All.
      tagGroupsStore.setState((state) => ({ ...state, loaded: false }));
      inflight = null;
      await load();
    })();
  });
}

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  window.pond.onSyncAction((event) => {
    if (event.modelName === "tag_group_member") {
      scheduleRefetch();
      return;
    }
    if (event.modelName !== "tag_group") return;
    if (!tagGroupsStore.state.loaded) return;

    const cache = tagGroupsStore.state.rows;

    if (event.action === "I") {
      const inserted = TagGroupRowSchema.safeParse(event.data);
      if (!inserted.success) return;
      const row = inserted.data;
      const idx = cache.findIndex((r) => r.id === row.id);
      const next = cache.slice();
      if (idx >= 0)
        next[idx] = {
          ...row,
          tagIds: cache[idx]?.tagIds ?? [],
          tagNames: cache[idx]?.tagNames ?? [],
        };
      else next.push(row);
      setRows(next);
      return;
    }
    if (event.action === "U") {
      const idx = cache.findIndex((r) => r.id === event.modelId);
      if (idx < 0) return;
      const existing = cache[idx];
      if (!existing) return;
      const next = cache.slice();
      next[idx] = { ...existing, ...TagGroupPatchSchema.parse(event.data) };
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

export function useTagGroups(): ReadonlyArray<TagGroupRow> {
  useEffect(() => {
    ensureSubscribed();
    void load();
  }, []);
  return useSelector(tagGroupsStore, (s) => s.rows);
}
