import type { Transaction } from "@pond/schema/tx";
import { expect, it } from "vitest";
import { createUndoHistory } from "./undo";

it("undoes and redoes an entire rating batch in one command", async () => {
  const ratings = new Map([
    ["a", 5],
    ["b", 5],
  ]);
  const history = createUndoHistory(async (transactions) => {
    for (const transaction of transactions) {
      if (transaction.kind !== "update" || transaction.model !== "save")
        throw new Error("Unexpected transaction");
      ratings.set(transaction.id, transaction.patch.rating ?? 0);
    }
  });
  const transactions: Transaction[] = ["a", "b"].map((id, index) => ({
    kind: "update",
    model: "save",
    id,
    patch: { rating: 5 },
    before: { rating: index + 1 },
  }));
  history.record(transactions);
  expect(await history.undo()).toBe(true);
  expect([...ratings.values()]).toEqual([1, 2]);
  expect(history.canUndo()).toBe(false);
  expect(await history.redo()).toBe(true);
  expect([...ratings.values()]).toEqual([5, 5]);
  expect(history.canRedo()).toBe(false);
});

it("keeps the batch available when undo fails and clears redo on new work", async () => {
  let failing = true;
  const history = createUndoHistory(async () => {
    if (failing) throw new Error("Library unavailable");
  });
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { rating: 5 },
    before: { rating: 1 },
  };
  history.record([transaction]);
  expect(await history.undo()).toBe(false);
  expect(history.canUndo()).toBe(true);
  expect(history.canRedo()).toBe(false);
  failing = false;
  expect(await history.undo()).toBe(true);
  history.record([transaction]);
  expect(history.canRedo()).toBe(false);
});

it("does not carry in-flight undo history into another library", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const history = createUndoHistory(async () => {
    entered.resolve();
    await release.promise;
  });
  history.record([
    {
      kind: "update",
      model: "save",
      id: "old-library",
      patch: { rating: 5 },
      before: { rating: 1 },
    },
  ]);
  const pending = history.undo();
  await entered.promise;
  history.clear();
  release.resolve();
  await pending;
  expect(history.canUndo()).toBe(false);
  expect(history.canRedo()).toBe(false);
});

it("swaps replacement bytes when undoing and redoing file compression", async () => {
  const committed: Transaction[][] = [];
  const history = createUndoHistory(async (transactions) => {
    committed.push(transactions);
  });
  const original = new Uint8Array([1, 2, 3]);
  const compressed = new Uint8Array([4, 5]);
  history.record([
    {
      kind: "update",
      model: "save",
      id: "image",
      before: { files: [] },
      patch: { files: [] },
      files: [{ filename: "image.png", bytes: compressed }],
      beforeFiles: [{ filename: "image.png", bytes: original }],
    },
  ]);
  expect(await history.undo()).toBe(true);
  expect(committed[0]?.[0]).toMatchObject({
    files: [{ filename: "image.png", bytes: original }],
    beforeFiles: [{ filename: "image.png", bytes: compressed }],
  });
  expect(await history.redo()).toBe(true);
  expect(committed[1]?.[0]).toMatchObject({
    files: [{ filename: "image.png", bytes: compressed }],
    beforeFiles: [{ filename: "image.png", bytes: original }],
  });
});

function ratingChange(id: string, rating: number): Transaction {
  return {
    kind: "update",
    model: "save",
    id,
    patch: { rating },
    before: { rating: 0 },
  };
}

it("undoes and redoes a step only while it is the latest change in that direction", async () => {
  const committed: string[] = [];
  let next = 0;
  const history = createUndoHistory(
    async (transactions) => {
      for (const transaction of transactions)
        if (transaction.kind === "update" && transaction.model === "save")
          committed.push(`${transaction.id}:${transaction.patch.rating}`);
    },
    () => `step-${++next}`,
  );
  const first = history.record([ratingChange("a", 5)]);
  expect(first).toBe("step-1");
  expect(await history.undoStep("step-1")).toBe("done");
  expect(await history.undoStep("step-1")).toBe("done");
  expect(committed).toEqual(["a:0"]);
  expect(await history.redoStep("step-1")).toBe("done");
  expect(committed).toEqual(["a:0", "a:5"]);

  history.record([ratingChange("b", 4)]);
  expect(await history.undoStep("step-1")).toBe("stale");
  expect(committed).toEqual(["a:0", "a:5"]);
  expect(await history.undoStep("step-2")).toBe("done");
  expect(await history.redoStep("step-1")).toBe("done");
  expect(await history.redoStep("missing")).toBe("stale");
  expect(committed).toEqual(["a:0", "a:5", "b:0"]);
});

it("keeps a step in place when its scoped undo fails", async () => {
  let failing = true;
  const history = createUndoHistory(async () => {
    if (failing) throw new Error("Library unavailable");
  });
  const step = history.record([ratingChange("a", 5)]);
  if (!step) throw new Error("Missing step");
  expect(await history.undoStep(step)).toBe("failed");
  expect(history.canUndo()).toBe(true);
  failing = false;
  expect(await history.undoStep(step)).toBe("done");
  expect(history.canRedo()).toBe(true);
});

it("records no step for an empty change and forgets steps from another library", async () => {
  const history = createUndoHistory(async () => {});
  expect(history.record([])).toBeNull();
  const step = history.record([ratingChange("a", 5)]);
  if (!step) throw new Error("Missing step");
  history.clear();
  expect(await history.undoStep(step)).toBe("stale");
});

it("reports which step the latest Undo and Redo reversed", async () => {
  let failing = false;
  let next = 0;
  const history = createUndoHistory(
    async () => {
      if (failing) throw new Error("Library unavailable");
    },
    () => `step-${++next}`,
  );
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { favorite: true },
    before: { favorite: false },
  };
  expect(await history.undoLatest()).toEqual({ ok: false, step: null });
  history.record([transaction]);
  history.record([transaction]);
  expect(await history.undoLatest()).toEqual({ ok: true, step: "step-2" });
  expect(await history.redoLatest()).toEqual({ ok: true, step: "step-2" });
  failing = true;
  expect(await history.undoLatest()).toEqual({ ok: false, step: "step-2" });
  expect(history.canUndo()).toBe(true);
});
