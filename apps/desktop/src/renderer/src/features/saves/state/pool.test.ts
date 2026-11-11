import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSaves } from "../lib/ensure-saves";
import { normalise } from "../lib/reconcile";
import type { Save } from "../types";
import {
  onPoolDirty,
  POOL_SOFT_CAP,
  POOL_TRIM_TARGET,
  pool,
  protectSaves,
  savesStore,
  trimPool,
} from "./pool";
import { resultNavigation } from "./result-navigation";
import { selection } from "./selection";

function rows(count: number): Save[] {
  return Array.from({ length: count }, (_, index) => {
    const save = normalise({
      id: `row-${index}`,
      savedAt: index,
      createdAt: 1,
    });
    if (!save) throw new Error("Invalid fixture");
    return save;
  });
}

beforeEach(() => {
  pool.clear();
  pool.bulkUpsert(
    [
      ["first", 30],
      ["tie-a", 20],
      ["tie-b", 20],
      ["last", 10],
    ].map(([id, savedAt]) => {
      const save = normalise({
        id: String(id),
        savedAt: Number(savedAt),
        createdAt: 1,
      });
      if (!save) throw new Error("Invalid fixture");
      return save;
    }),
  );
});
afterEach(() => pool.clear());

it("deletes present IDs once, preserving survivor order and consistency", () => {
  const before = pool.snapshot();
  const revision = savesStore.state.revision;
  const publications: string[][] = [];
  const dirty: string[][] = [];
  const subscription = savesStore.subscribe(() =>
    publications.push(pool.snapshot().map((save) => save.id)),
  );
  const detach = onPoolDirty((ids) => {
    // Notification is after publication; all deleted rows are already gone.
    expect(publications).toHaveLength(1);
    for (const id of ids) expect(pool.get(id)).toBeUndefined();
    dirty.push([...ids]);
  });
  try {
    pool.bulkDelete(["last", "missing", "first", "last"]);
    expect(publications).toEqual([["tie-a", "tie-b"]]);
    expect(dirty).toEqual([["last", "first"]]);
    expect(savesStore.state.revision).toBe(revision + 1);
    expect(pool.snapshot()).toEqual(before.slice(1, 3));
    expect([...pool.ids()]).toEqual(["tie-a", "tie-b"]);
    for (const save of pool.snapshot()) expect(pool.get(save.id)).toBe(save);
  } finally {
    subscription.unsubscribe();
    detach();
  }
});

it("does not publish or notify for empty and all-missing deletions", () => {
  const state = savesStore.state;
  let publications = 0;
  const dirty: string[][] = [];
  const subscription = savesStore.subscribe(() => {
    publications++;
  });
  const detach = onPoolDirty((ids) => dirty.push([...ids]));
  try {
    pool.bulkDelete([]);
    pool.bulkDelete(["missing", "missing"]);
    expect(savesStore.state).toBe(state);
    expect(publications).toBe(0);
    expect(dirty).toEqual([]);
  } finally {
    subscription.unsubscribe();
    detach();
  }
});

it("matches single upserts when incoming Saves tie the existing head", () => {
  const before = pool.snapshot();
  const incoming = ["new-a", "new-b"].map((id) => {
    const save = normalise({ id, savedAt: 30, createdAt: 1 });
    if (!save) throw new Error("Invalid fixture");
    return save;
  });
  for (const save of incoming) pool.upsert(save);
  const expected = pool.snapshot();
  pool.clear();
  pool.bulkUpsert(before);
  pool.bulkUpsert(incoming);
  expect(pool.snapshot()).toEqual(expected);
  expect(pool.snapshot().map((save) => save.id)).toEqual([
    "first",
    "new-a",
    "new-b",
    "tie-a",
    "tie-b",
    "last",
  ]);
  for (const save of pool.snapshot()) expect(pool.get(save.id)).toBe(save);
});

it("keeps tied update order and prepends strictly newer Saves", () => {
  const before = pool.snapshot();
  const incoming = before.map((save) => ({ ...save, title: "Updated" }));
  pool.bulkUpsert(incoming);
  expect(pool.snapshot().map((save) => save.id)).toEqual(
    before.map((save) => save.id),
  );
  const newest = normalise({ id: "newest", savedAt: 40, createdAt: 1 });
  if (!newest) throw new Error("Invalid fixture");
  pool.bulkUpsert([newest]);
  expect(pool.snapshot()).toEqual([newest, ...incoming]);
});

it("keeps single-delete behavior", () => {
  const revision = savesStore.state.revision;
  pool.delete("tie-a");
  expect(pool.get("tie-a")).toBeUndefined();
  expect(pool.snapshot().map((save) => save.id)).toEqual([
    "first",
    "tie-b",
    "last",
  ]);
  expect(savesStore.state.revision).toBe(revision + 1);
});

describe("bounded pool", () => {
  const overCap = POOL_SOFT_CAP + 500;
  const excess = overCap - POOL_TRIM_TARGET;

  beforeEach(() => pool.clear());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    selection.clear();
    resultNavigation.setSource({ ids: [] });
  });

  it("trims after a write that crosses the cap settles, not during it", () => {
    vi.useFakeTimers();
    pool.bulkUpsert(rows(overCap));
    expect(pool.snapshot()).toHaveLength(overCap);
    vi.runOnlyPendingTimers();
    expect(pool.snapshot()).toHaveLength(POOL_TRIM_TARGET);
  });

  it("evicts least recently touched rows and keeps sorted, byId, and revision consistent", () => {
    const saves = rows(overCap);
    pool.bulkUpsert(saves);
    pool.get("row-0");
    const revision = savesStore.state.revision;
    const publications: number[] = [];
    const dirty: string[][] = [];
    const subscription = savesStore.subscribe(() =>
      publications.push(pool.snapshot().length),
    );
    const detach = onPoolDirty((ids) => dirty.push([...ids]));
    try {
      expect(trimPool()).toBe(excess);
      const kept = [saves[0], ...saves.slice(excess + 1)];
      expect(publications).toEqual([POOL_TRIM_TARGET]);
      expect(savesStore.state.revision).toBe(revision + 1);
      expect(dirty).toEqual([
        saves.slice(1, excess + 1).map((save) => save.id),
      ]);
      expect(pool.snapshot()).toEqual([...kept].reverse());
      expect(new Set(pool.ids())).toEqual(
        new Set(kept.map((save) => save?.id)),
      );
      for (const save of pool.snapshot()) expect(pool.get(save.id)).toBe(save);
      expect(trimPool()).toBe(0);
    } finally {
      subscription.unsubscribe();
      detach();
    }
  });

  it("keeps guarded, selected, and result rows even when least recently touched", () => {
    pool.bulkUpsert(rows(overCap));
    selection.set(["row-2"]);
    selection.setCursor("row-3");
    resultNavigation.setSource({ ids: ["row-4"], loadedIds: () => ["row-5"] });
    const release = protectSaves(() => ["row-0", null, "row-1"]);
    try {
      trimPool();
    } finally {
      release();
    }
    for (let index = 0; index < 6; index++)
      expect(pool.get(`row-${index}`)).toBeDefined();
    expect(pool.get("row-6")).toBeUndefined();
    expect(pool.snapshot()).toHaveLength(POOL_TRIM_TARGET);
  });

  it("stays above the cap instead of evicting protected rows", () => {
    const saves = rows(POOL_SOFT_CAP + 10);
    pool.bulkUpsert(saves);
    const release = protectSaves(() => saves.map((save) => save.id));
    expect(trimPool()).toBe(0);
    expect(pool.snapshot()).toHaveLength(saves.length);
    release();
    expect(trimPool()).toBe(saves.length - POOL_TRIM_TARGET);
  });

  it("refetches evicted rows through ensureSaves", async () => {
    pool.bulkUpsert(rows(overCap));
    trimPool();
    expect(pool.get("row-0")).toBeUndefined();
    const query = vi.fn(async (_name: string, input: { ids: string[] }) =>
      input.ids.map((id) => ({ id, savedAt: 0, createdAt: 1 })),
    );
    vi.stubGlobal("window", { pond: { query } });
    await ensureSaves(["row-0", `row-${overCap - 1}`]);
    expect(query.mock.calls).toEqual([["saves.getMany", { ids: ["row-0"] }]]);
    expect(pool.get("row-0")?.id).toBe("row-0");
    expect(pool.snapshot().at(-1)?.id).toBe("row-0");
    expect(pool.snapshot()).toHaveLength(POOL_TRIM_TARGET + 1);
  });
});
