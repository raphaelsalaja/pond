import type { BulkEdit } from "@shared/bulk-contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { onPoolDirty, pool, savesStore } from "../state/pool";
import { bulkMutation, mutateSave, setSaveTags } from "./mutate";
import { normalise, SavePatchSchema } from "./reconcile";

beforeEach(() => {
  pool.clear();
  const save = normalise(
    SavePatchSchema.parse({
      id: "saved",
      title: "Before",
      url: "https://example.com",
      tags: ["original"],
    }),
  );
  if (!save) throw new Error("Fixture must produce a save");
  pool.upsert(save);
});
afterEach(() => {
  pool.clear();
  vi.unstubAllGlobals();
});

it("shows an edit immediately and sends its previous value for undo", async () => {
  const pending = Promise.withResolvers<void>();
  const tx = vi.fn(() => pending.promise);
  vi.stubGlobal("window", { pond: { tx } });
  const edit = mutateSave("saved", { title: "After" });
  expect(pool.get("saved")?.title).toBe("After");
  expect(tx).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "saved",
      patch: { title: "After" },
      before: { title: "Before" },
    }),
  );
  pending.resolve();
  await edit;
  expect(pool.get("saved")?.title).toBe("After");
});

it("restores tag membership when persistence rejects the edit", async () => {
  const pending = Promise.withResolvers<void>();
  const query = vi.fn(() => pending.promise);
  vi.stubGlobal("window", { pond: { query } });
  const edit = setSaveTags("saved", ["new"]);
  expect(pool.get("saved")?.tags).toEqual(["new"]);
  pending.reject(new Error("Library unavailable"));
  await edit;
  expect(pool.get("saved")?.tags).toEqual(["original"]);
  expect(query).toHaveBeenCalledWith("tags.setForSave", {
    saveId: "saved",
    tags: ["new"],
  });
});

it("retains cold IDs for trash, restore, and purge beyond the loaded page", async () => {
  const ids = [
    "saved",
    ...Array.from({ length: 300 }, (_, index) => `cold-${index}`),
  ];
  const query = vi.fn(async () => ({ changed: ids.length }));
  vi.stubGlobal("window", { pond: { query } });
  const { trashSaves, untrashSaves, purgeSaves } = await import("./mutate");
  expect(await trashSaves(ids)).toBe(ids.length);
  expect(await untrashSaves(ids)).toBe(ids.length);
  expect(await purgeSaves(ids)).toBe(ids.length);
  expect(query.mock.calls).toEqual([
    ["saves.bulkEdit", { ids, operation: { kind: "trash" } }],
    ["feedback.emit", { event: "saveDeletion" }],
    ["saves.bulkEdit", { ids, operation: { kind: "untrash" } }],
    ["saves.bulkEdit", { ids, operation: { kind: "purge" } }],
    ["feedback.emit", { event: "saveDeletion" }],
  ]);
});

it("clears loaded tags optimistically for a replace operation", async () => {
  const pending = Promise.withResolvers<{ changed: number }>();
  const query = vi.fn(() => pending.promise);
  vi.stubGlobal("window", { pond: { query } });
  const edit = bulkMutation(["saved"], {
    kind: "tags",
    tags: [],
    mode: "replace",
  });
  expect(pool.get("saved")?.tags).toEqual([]);
  pending.resolve({ changed: 1 });
  await edit;
  expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids: ["saved"],
    operation: { kind: "tags", tags: [], mode: "replace" },
  });
});

const operations: BulkEdit["operation"][] = [
  { kind: "trash" },
  { kind: "untrash" },
  { kind: "purge" },
  { kind: "rating", rating: 4 },
  { kind: "rating", rating: 0 },
  { kind: "notes", notes: "Updated" },
  { kind: "tags", mode: "replace", tags: ["new"] },
  { kind: "tags", mode: "add", tags: ["new"] },
  { kind: "tags", mode: "remove", tags: ["original"] },
  { kind: "suggested-tags" },
];
for (const operation of operations) {
  for (const reject of [false, true]) {
    it(`characterizes ${JSON.stringify(operation)} reject=${reject}`, async () => {
      pool.clear();
      const before = [30, 20, 10].map((savedAt, index) => {
        const save = normalise({
          id: String(index),
          savedAt,
          createdAt: 1,
          deletedAt: index === 1 ? 1 : null,
          tags: ["original"],
          rating: 2,
          notes: "Before",
        });
        if (!save) throw new Error("Invalid fixture");
        return save;
      });
      pool.bulkUpsert(before);
      const dirty: string[] = [];
      const batches: string[][] = [];
      let publications = 0;
      const subscription = savesStore.subscribe(() => {
        publications++;
      });
      const detach = onPoolDirty((ids) => {
        dirty.push(...ids);
        batches.push([...ids]);
      });
      const pending = Promise.withResolvers<{ changed: number }>();
      const query = vi.fn((name: string) =>
        name === "saves.bulkEdit"
          ? pending.promise
          : Promise.resolve(undefined),
      );
      vi.stubGlobal("window", { pond: { query } });
      try {
        const mutation = bulkMutation(["2", "cold", "0", "1", "2"], operation);
        const optimistic = before.map((save) => {
          if (operation.kind === "trash")
            return { ...save, deletedAt: pool.get(save.id)?.deletedAt };
          if (operation.kind === "untrash") return { ...save, deletedAt: null };
          if (operation.kind === "rating" && !save.deletedAt)
            return { ...save, rating: operation.rating || null };
          if (operation.kind === "notes")
            return { ...save, notes: operation.notes };
          if (operation.kind === "tags" && operation.mode === "replace")
            return { ...save, tags: operation.tags };
          return save;
        });
        expect(pool.snapshot()).toEqual(
          operation.kind === "purge" ? [] : optimistic,
        );
        for (const save of pool.snapshot())
          expect(pool.get(save.id)).toEqual(save);
        const changes =
          (operation.kind === "tags" && operation.mode !== "replace") ||
          operation.kind === "suggested-tags"
            ? []
            : operation.kind === "rating"
              ? ["2", "0"]
              : ["2", "0", "1"];
        expect(dirty).toEqual(changes);
        expect(publications).toBe(changes.length ? 1 : 0);
        expect(batches).toEqual(changes.length ? [changes] : []);
        expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
          ids: ["2", "cold", "0", "1"],
          operation,
        });
        if (reject) {
          const rejected = expect(mutation).rejects.toThrow(
            "Synthetic rejection",
          );
          pending.reject(new Error("Synthetic rejection"));
          await rejected;
          expect(pool.snapshot()).toEqual(before);
          for (const save of before) expect(pool.get(save.id)).toEqual(save);
          expect(dirty.slice(changes.length)).toEqual(changes);
          expect(publications).toBe(changes.length ? 2 : 0);
          expect(batches).toEqual(changes.length ? [changes, changes] : []);
        } else {
          pending.resolve({ changed: 4 });
          expect(await mutation).toBe(4);
          expect(publications).toBe(changes.length ? 1 : 0);
        }
      } finally {
        subscription.unsubscribe();
        detach();
      }
    });
  }
}
it("keeps surviving tied Saves ahead of restored Saves after rejected purge", async () => {
  pool.clear();
  const before = ["selected", "survivor"].map((id) => {
    const save = normalise({ id, savedAt: 20, createdAt: 1 });
    if (!save) throw new Error("Invalid fixture");
    return save;
  });
  pool.bulkUpsert(before);
  const pending = Promise.withResolvers<{ changed: number }>();
  vi.stubGlobal("window", { pond: { query: () => pending.promise } });
  const mutation = bulkMutation(["selected"], { kind: "purge" });
  expect(pool.snapshot().map((save) => save.id)).toEqual(["survivor"]);
  const rejected = expect(mutation).rejects.toThrow("Synthetic rejection");
  pending.reject(new Error("Synthetic rejection"));
  await rejected;
  expect(pool.snapshot().map((save) => save.id)).toEqual([
    "survivor",
    "selected",
  ]);
  for (const save of before) expect(pool.get(save.id)).toEqual(save);
});

for (const ids of [[], ["cold"], ["trashed", "cold"]]) {
  it(`does not publish no-op rating phases for ${JSON.stringify(ids)}`, async () => {
    const trashed = normalise({
      id: "trashed",
      savedAt: 1,
      createdAt: 1,
      deletedAt: 1,
    });
    if (!trashed) throw new Error("Invalid fixture");
    pool.upsert(trashed);
    const before = pool.snapshot();
    const pending = Promise.withResolvers<{ changed: number }>();
    const query = vi.fn(() => pending.promise);
    vi.stubGlobal("window", { pond: { query } });
    let publications = 0;
    const subscription = savesStore.subscribe(() => {
      publications++;
    });
    const dirty: string[][] = [];
    const detach = onPoolDirty((changed) => dirty.push([...changed]));
    try {
      const mutation = bulkMutation(ids, { kind: "rating", rating: 3 });
      expect(publications).toBe(0);
      if (ids.length) {
        const rejected = expect(mutation).rejects.toThrow(
          "Synthetic rejection",
        );
        pending.reject(new Error("Synthetic rejection"));
        await rejected;
        expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
          ids,
          operation: { kind: "rating", rating: 3 },
        });
      } else {
        expect(await mutation).toBe(0);
        expect(query).not.toHaveBeenCalled();
      }
      expect(publications).toBe(0);
      expect(dirty).toEqual([]);
      expect(pool.snapshot()).toBe(before);
    } finally {
      subscription.unsubscribe();
      detach();
    }
  });
}

it("does not send an empty selection", async () => {
  const query = vi.fn();
  vi.stubGlobal("window", { pond: { query } });
  const before = pool.snapshot();
  expect(await bulkMutation([], { kind: "trash" })).toBe(0);
  expect(pool.snapshot()).toBe(before);
  expect(query).not.toHaveBeenCalled();
});
