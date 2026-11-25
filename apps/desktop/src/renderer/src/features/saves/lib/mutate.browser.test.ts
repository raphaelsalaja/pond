import type { BulkEdit, BulkQueryResults } from "@shared/bulk-contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { wireSave } from "@/shared/test/wire-save";
import { onPoolDirty, pool, savesStore } from "../state/pool";
import {
  bulkMutation,
  mutateSave,
  purgeSaves,
  setSaveTags,
  trashSaves,
  untrashSaves,
} from "./mutate";
import { normalise, SavePatchSchema } from "./reconcile";

type BulkEditResult = BulkQueryResults["saves.bulkEdit"];

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
  if (!save) {
    throw new Error("Fixture must produce a save");
  }
  pool.upsert(save);
});
afterEach(() => {
  pool.clear();
});

it("shows an edit immediately and sends its previous value for undo", async () => {
  const pending = Promise.withResolvers<void>();
  bridge.use({ tx: () => pending.promise });
  const edit = mutateSave("saved", { title: "After" });
  expect(pool.get("saved")?.title).toBe("After");
  expect(window.pond.tx).toHaveBeenCalledWith(
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

it("refetches a Save the pool evicted before applying an edit", async () => {
  pool.clear();
  const row = wireSave({
    id: "saved",
    title: "Before",
    url: "https://example.com",
  });
  bridge.use({
    query: { "saves.getMany": () => [row] },
    tx: async () => {},
  });
  await mutateSave("saved", { title: "After" }, { throwOnError: true });
  expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
    ids: ["saved"],
  });
  expect(window.pond.tx).toHaveBeenCalledWith(
    expect.objectContaining({ before: { title: "Before" } }),
  );
  expect(pool.get("saved")?.title).toBe("After");
});

it("restores tag membership when persistence rejects the edit", async () => {
  const pending = Promise.withResolvers<{ ok: true }>();
  bridge.use({ query: { "tags.setForSave": () => pending.promise } });
  const edit = setSaveTags("saved", ["new"]);
  expect(pool.get("saved")?.tags).toEqual(["new"]);
  pending.reject(new Error("Library unavailable"));
  await edit;
  expect(pool.get("saved")?.tags).toEqual(["original"]);
  expect(window.pond.query).toHaveBeenCalledWith("tags.setForSave", {
    saveId: "saved",
    tags: ["new"],
  });
});

it("retains cold IDs for trash, restore, and purge beyond the loaded page", async () => {
  const ids = [
    "saved",
    ...Array.from({ length: 300 }, (_, index) => `cold-${index}`),
  ];
  const calls: Array<[string, unknown]> = [];
  bridge.use({
    query: {
      "saves.bulkEdit": (input) => {
        calls.push(["saves.bulkEdit", input]);
        return { changed: ids.length, undoId: null };
      },
      "feedback.emit": (input) => {
        calls.push(["feedback.emit", input]);
        return { ok: true };
      },
    },
  });
  const changed = { changed: ids.length, undoId: null };
  expect(await trashSaves(ids)).toEqual(changed);
  expect(await untrashSaves(ids)).toEqual(changed);
  expect(await purgeSaves(ids)).toEqual(changed);
  expect(calls).toEqual([
    ["saves.bulkEdit", { ids, operation: { kind: "trash" } }],
    ["feedback.emit", { event: "saveDeletion" }],
    ["saves.bulkEdit", { ids, operation: { kind: "untrash" } }],
    ["saves.bulkEdit", { ids, operation: { kind: "purge" } }],
    ["feedback.emit", { event: "saveDeletion" }],
  ]);
});

it("clears loaded tags optimistically for a replace operation", async () => {
  const pending = Promise.withResolvers<BulkEditResult>();
  bridge.use({ query: { "saves.bulkEdit": () => pending.promise } });
  const edit = bulkMutation(["saved"], {
    kind: "tags",
    tags: [],
    mode: "replace",
  });
  expect(pool.get("saved")?.tags).toEqual([]);
  pending.resolve({ changed: 1, undoId: null });
  await edit;
  expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids: ["saved"],
    operation: { kind: "tags", tags: [], mode: "replace" },
  });
});

const operations: Array<BulkEdit["operation"]> = [
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

function startCharacterization(operation: BulkEdit["operation"]) {
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
    if (!save) {
      throw new Error("Invalid fixture");
    }
    return save;
  });
  pool.bulkUpsert(before);
  const dirty: Array<string> = [];
  const batches: Array<Array<string>> = [];
  let publications = 0;
  const subscription = savesStore.subscribe(() => {
    publications++;
  });
  const detach = onPoolDirty((ids) => {
    dirty.push(...ids);
    batches.push([...ids]);
  });
  const pending = Promise.withResolvers<BulkEditResult>();
  bridge.use({
    query: {
      "saves.bulkEdit": () => pending.promise,
      "feedback.emit": () => ({ ok: true }),
    },
  });
  const mutation = bulkMutation(["2", "cold", "0", "1", "2"], operation);
  const optimistic = before.map((save) => {
    if (operation.kind === "trash") {
      return { ...save, deletedAt: pool.get(save.id)?.deletedAt };
    }
    if (operation.kind === "untrash") {
      return { ...save, deletedAt: null };
    }
    if (operation.kind === "rating" && !save.deletedAt) {
      return { ...save, rating: operation.rating || null };
    }
    if (operation.kind === "notes") {
      return { ...save, notes: operation.notes };
    }
    if (operation.kind === "tags" && operation.mode === "replace") {
      return { ...save, tags: operation.tags };
    }
    return save;
  });
  expect(pool.snapshot()).toEqual(operation.kind === "purge" ? [] : optimistic);
  for (const save of pool.snapshot()) {
    expect(pool.get(save.id)).toEqual(save);
  }
  const changes =
    (operation.kind === "tags" && operation.mode !== "replace") ||
    operation.kind === "suggested-tags"
      ? []
      : operation.kind === "rating"
        ? ["2", "0"]
        : operation.kind === "untrash"
          ? ["1"]
          : ["2", "0", "1"];
  expect(dirty).toEqual(changes);
  expect(publications).toBe(changes.length ? 1 : 0);
  expect(batches).toEqual(changes.length ? [changes] : []);
  expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
    ids: ["2", "cold", "0", "1"],
    operation,
  });
  return {
    before,
    batches,
    changes,
    dirty,
    mutation,
    pending,
    publications: () => publications,
    stop: () => {
      subscription.unsubscribe();
      detach();
    },
  };
}

for (const operation of operations) {
  it(`characterizes ${JSON.stringify(operation)} reject=false`, async () => {
    const run = startCharacterization(operation);
    try {
      run.pending.resolve({ changed: 4, undoId: null });
      expect(await run.mutation).toEqual({ changed: 4, undoId: null });
      expect(run.publications()).toBe(run.changes.length ? 1 : 0);
    } finally {
      run.stop();
    }
  });

  it(`characterizes ${JSON.stringify(operation)} reject=true`, async () => {
    const run = startCharacterization(operation);
    try {
      const rejected = expect(run.mutation).rejects.toThrow(
        "Synthetic rejection",
      );
      run.pending.reject(new Error("Synthetic rejection"));
      await rejected;
      expect(pool.snapshot()).toEqual(run.before);
      for (const save of run.before) {
        expect(pool.get(save.id)).toEqual(save);
      }
      expect(run.dirty.slice(run.changes.length)).toEqual(run.changes);
      expect(run.publications()).toBe(run.changes.length ? 2 : 0);
      expect(run.batches).toEqual(
        run.changes.length ? [run.changes, run.changes] : [],
      );
    } finally {
      run.stop();
    }
  });
}

it("keeps surviving tied Saves ahead of restored Saves after rejected purge", async () => {
  pool.clear();
  const before = ["selected", "survivor"].map((id) => {
    const save = normalise({ id, savedAt: 20, createdAt: 1 });
    if (!save) {
      throw new Error("Invalid fixture");
    }
    return save;
  });
  pool.bulkUpsert(before);
  const pending = Promise.withResolvers<BulkEditResult>();
  bridge.use({ query: { "saves.bulkEdit": () => pending.promise } });
  const mutation = bulkMutation(["selected"], { kind: "purge" });
  expect(pool.snapshot().map((save) => save.id)).toEqual(["survivor"]);
  const rejected = expect(mutation).rejects.toThrow("Synthetic rejection");
  pending.reject(new Error("Synthetic rejection"));
  await rejected;
  expect(pool.snapshot().map((save) => save.id)).toEqual([
    "survivor",
    "selected",
  ]);
  for (const save of before) {
    expect(pool.get(save.id)).toEqual(save);
  }
});

function watchPool() {
  const trashed = normalise({
    id: "trashed",
    savedAt: 1,
    createdAt: 1,
    deletedAt: 1,
  });
  if (!trashed) {
    throw new Error("Invalid fixture");
  }
  pool.upsert(trashed);
  let publications = 0;
  const subscription = savesStore.subscribe(() => {
    publications++;
  });
  const dirty: Array<Array<string>> = [];
  const detach = onPoolDirty((changed) => dirty.push([...changed]));
  return {
    before: pool.snapshot(),
    dirty,
    publications: () => publications,
    stop: () => {
      subscription.unsubscribe();
      detach();
    },
  };
}

it("does not publish or send a no-op rating for an empty selection", async () => {
  const watch = watchPool();
  try {
    const mutation = bulkMutation([], { kind: "rating", rating: 3 });
    expect(watch.publications()).toBe(0);
    expect(await mutation).toEqual({ changed: 0, undoId: null });
    expect(window.pond.query).not.toHaveBeenCalled();
    expect(watch.publications()).toBe(0);
    expect(watch.dirty).toEqual([]);
    expect(pool.snapshot()).toBe(watch.before);
  } finally {
    watch.stop();
  }
});

for (const ids of [["cold"], ["trashed", "cold"]]) {
  it(`does not publish no-op rating phases for ${JSON.stringify(ids)}`, async () => {
    const watch = watchPool();
    const pending = Promise.withResolvers<BulkEditResult>();
    bridge.use({ query: { "saves.bulkEdit": () => pending.promise } });
    try {
      const mutation = bulkMutation(ids, { kind: "rating", rating: 3 });
      expect(watch.publications()).toBe(0);
      const rejected = expect(mutation).rejects.toThrow("Synthetic rejection");
      pending.reject(new Error("Synthetic rejection"));
      await rejected;
      expect(window.pond.query).toHaveBeenCalledWith("saves.bulkEdit", {
        ids,
        operation: { kind: "rating", rating: 3 },
      });
      expect(watch.publications()).toBe(0);
      expect(watch.dirty).toEqual([]);
      expect(pool.snapshot()).toBe(watch.before);
    } finally {
      watch.stop();
    }
  });
}

it("does not send an empty selection", async () => {
  const before = pool.snapshot();
  expect(await bulkMutation([], { kind: "trash" })).toEqual({
    changed: 0,
    undoId: null,
  });
  expect(pool.snapshot()).toBe(before);
  expect(window.pond.query).not.toHaveBeenCalled();
});
