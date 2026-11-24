import "@/app/effects/save-library-bridge";
import { afterEach, describe, expect, it } from "vitest";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { selectResults } from "./select-results";

interface PendingLookup {
  finish?: (ids: Array<string>) => void;
}

function deferredIds() {
  const pending: PendingLookup = {};
  const promise = new Promise<Array<string>>((resolve) => {
    pending.finish = resolve;
  });
  const { finish } = pending;
  if (!finish) {
    throw new Error("Lookup is not pending");
  }
  return { promise, finish };
}

describe("complete result selection", () => {
  afterEach(() => {
    resultNavigation.setSource({ key: "empty", ids: [] });
    selection.clear();
    primarySelection.set(null);
  });
  it("inverts across cold results and updates the cursor and primary selection", async () => {
    const ids = Array.from({ length: 301 }, (_, index) => `save-${index}`);
    resultNavigation.setSource({
      key: "large",
      ids: ids.slice(0, 2),
      allIds: async () => ids,
    });
    selection.set(ids.slice(0, 2));
    selection.setCursor(ids[0] ?? null);
    await selectResults("invert");
    expect(selection.snapshot()).toEqual(ids.slice(2));
    expect(selection.getCursor()).toBe("save-2");
    expect(primarySelection.get()).toBe("save-2");
    await selectResults("all");
    expect(selection.snapshot()).toEqual(ids);
    expect(selection.getCursor()).toBe("save-2");
  });
  it("does not replace the selection after the collection changes during lookup", async () => {
    const pending = deferredIds();
    resultNavigation.setSource({
      key: "old",
      ids: ["old"],
      allIds: () => pending.promise,
    });
    const operation = selectResults("all");
    resultNavigation.setSource({ key: "new", ids: ["new"] });
    selection.set(["new"]);
    pending.finish(["old", "cold-old"]);
    await operation;
    expect(selection.snapshot()).toEqual(["new"]);
  });
  it("keeps the newest selection command when lookups finish out of order", async () => {
    const first = deferredIds();
    const second = deferredIds();
    let calls = 0;
    resultNavigation.setSource({
      key: "same",
      ids: ["A"],
      allIds: () => (++calls === 1 ? first.promise : second.promise),
    });
    selection.set(["A"]);
    const older = selectResults("all");
    const newer = selectResults("invert");
    second.finish(["A", "B", "C"]);
    await newer;
    first.finish(["A", "B", "C"]);
    await older;
    expect(selection.snapshot()).toEqual(["B", "C"]);
  });
  it("preserves the prior selection when the full-result lookup fails", async () => {
    resultNavigation.setSource({
      key: "failure",
      ids: ["A"],
      allIds: async () => {
        throw new Error("Library unavailable");
      },
    });
    selection.set(["A"]);
    await selectResults("all");
    expect(selection.snapshot()).toEqual(["A"]);
  });
});
