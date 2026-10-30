import { afterEach, beforeEach, expect, it } from "vitest";
import { normalise } from "../lib/reconcile";
import { onPoolDirty, pool, savesStore } from "./pool";

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
