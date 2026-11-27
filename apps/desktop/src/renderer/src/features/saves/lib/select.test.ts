import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { followDeparture } from "./save-nav";
import {
  clearSaveSelection,
  clickSave,
  createSelectionReconciler,
  isLibraryBackgroundTarget,
  pickSave,
  selectOnlySave,
} from "./select";

beforeEach(() => {
  localStorage.clear();
  selection.clear();
  primarySelection.set(null);
});

afterEach(() => {
  selection.clear();
  primarySelection.set(null);
});

describe("clickSave", () => {
  it("selects the clicked save without opening a range", () => {
    clickSave("a", { meta: false, shift: false }, ["a", "b", "c"]);
    expect(selection.snapshot()).toEqual(["a"]);
    expect(selection.getAnchor()).toBe("a");
    expect(primarySelection.get()).toBe("a");
  });

  it("replaces the previous selection on a plain click", () => {
    clickSave("a", { meta: false, shift: false }, ["a", "b", "c"]);
    clickSave("c", { meta: false, shift: false }, ["a", "b", "c"]);
    expect(selection.snapshot()).toEqual(["c"]);
    expect(primarySelection.get()).toBe("c");
  });

  it("toggles a save with the meta key", () => {
    clickSave("a", { meta: false, shift: false }, ["a", "b", "c"]);
    clickSave("c", { meta: true, shift: false }, ["a", "b", "c"]);
    expect(selection.snapshot()).toEqual(["a", "c"]);
    expect(primarySelection.get()).toBe("c");
    clickSave("c", { meta: true, shift: false }, ["a", "b", "c"]);
    expect(selection.snapshot()).toEqual(["a"]);
    expect(primarySelection.get()).toBe("a");
  });

  it("selects a range with shift", () => {
    clickSave("a", { meta: false, shift: false }, ["a", "b", "c"]);
    clickSave("c", { meta: false, shift: true }, ["a", "b", "c"]);
    expect(selection.snapshot()).toEqual(["a", "b", "c"]);
    expect(selection.getAnchor()).toBe("a");
    expect(primarySelection.get()).toBe("c");
  });
});

describe("pickSave", () => {
  const ids = ["a", "b", "c", "d"];

  it("adds and removes Saves without a modifier key", () => {
    clickSave("a", { meta: false, shift: false }, ids);
    pickSave("c", { shift: false }, ids);
    expect(selection.snapshot()).toEqual(["a", "c"]);
    expect(primarySelection.get()).toBe("c");

    pickSave("a", { shift: false }, ids);
    expect(selection.snapshot()).toEqual(["c"]);
    expect(primarySelection.get()).toBe("c");
  });

  it("selects a range from the last picked Save with Shift", () => {
    pickSave("b", { shift: false }, ids);
    pickSave("d", { shift: true }, ids);
    expect(selection.snapshot()).toEqual(["b", "c", "d"]);
    expect(selection.getAnchor()).toBe("b");
  });
});

describe("clearSaveSelection", () => {
  it("clears the selection and the primary save", () => {
    selectOnlySave("a");
    clearSaveSelection();
    expect(selection.size()).toBe(0);
    expect(primarySelection.get()).toBeNull();
  });
});

describe("createSelectionReconciler", () => {
  const ids = ["a", "b", "c", "d"];

  afterEach(() => {
    resultNavigation.setSource({ ids: [] });
  });

  it("clears a single selected Save once it leaves the settled results", () => {
    const reconcile = createSelectionReconciler();
    reconcile({ key: "uncategorized", ids, settled: true });
    clickSave("b", { meta: false, shift: false }, ids);
    reconcile({ key: "uncategorized", ids: ["a", "c", "d"], settled: true });
    expect(selection.size()).toBe(0);
    expect(selection.getCursor()).toBeNull();
    expect(selection.getAnchor()).toBeNull();
    expect(primarySelection.get()).toBeNull();
  });

  it("keeps the selected Saves that remain", () => {
    const reconcile = createSelectionReconciler();
    reconcile({ key: "uncategorized", ids, settled: true });
    clickSave("a", { meta: false, shift: false }, ids);
    clickSave("c", { meta: true, shift: false }, ids);
    reconcile({ key: "uncategorized", ids: ["a", "b", "d"], settled: true });
    expect(selection.snapshot()).toEqual(["a"]);
    expect(selection.getCursor()).toBeNull();
    expect(primarySelection.get()).toBe("a");
    reconcile({ key: "uncategorized", ids: ["b", "d"], settled: true });
    expect(selection.size()).toBe(0);
    expect(primarySelection.get()).toBeNull();
  });

  it("waits for settled results before deselecting", () => {
    const reconcile = createSelectionReconciler();
    reconcile({ key: "uncategorized", ids, settled: true });
    selectOnlySave("b");
    reconcile({ key: "uncategorized", ids: [], settled: false });
    expect(selection.snapshot()).toEqual(["b"]);
    expect(primarySelection.get()).toBe("b");
    reconcile({ key: "uncategorized", ids, settled: true });
    expect(selection.snapshot()).toEqual(["b"]);
  });

  it("keeps the selection when the query changes", () => {
    const reconcile = createSelectionReconciler();
    reconcile({ key: "search:a", ids, settled: true });
    selectOnlySave("b");
    reconcile({ key: "search:ab", ids, settled: false });
    reconcile({ key: "search:ab", ids: ["a"], settled: true });
    expect(selection.snapshot()).toEqual(["b"]);
    expect(primarySelection.get()).toBe("b");
  });

  it("lets an open preview follow the departed Save to its neighbor", () => {
    const reconcile = createSelectionReconciler();
    resultNavigation.setSource({ key: "uncategorized", ids });
    reconcile({ key: "uncategorized", ids, settled: true });
    selectOnlySave("b");
    const off = followDeparture("b");
    const remaining = ["a", "c", "d"];
    resultNavigation.setSource({ key: "uncategorized", ids: remaining });
    reconcile({ key: "uncategorized", ids: remaining, settled: true });
    off();
    expect(selection.getCursor()).toBe("c");
    expect(primarySelection.get()).toBe("c");
    expect(selection.has("b")).toBe(false);
  });
});

describe("isLibraryBackgroundTarget", () => {
  it("treats empty grid space as a background click", () => {
    const root = document.createElement("div");
    root.setAttribute("data-library-grid", "");
    const gap = document.createElement("div");
    root.append(gap);
    expect(isLibraryBackgroundTarget(gap)).toBe(true);
  });

  it("treats viewport-only empty space as a background click", () => {
    const viewport = document.createElement("div");
    viewport.setAttribute("data-library-grid-viewport", "");
    const gap = document.createElement("div");
    viewport.append(gap);
    expect(isLibraryBackgroundTarget(gap)).toBe(true);
    expect(isLibraryBackgroundTarget(viewport)).toBe(true);
  });

  it("rejects targets outside the grid and viewport", () => {
    const outside = document.createElement("div");
    expect(isLibraryBackgroundTarget(outside)).toBe(false);
  });

  it("ignores clicks on a save card", () => {
    const root = document.createElement("div");
    root.setAttribute("data-library-grid", "");
    const card = document.createElement("li");
    card.setAttribute("data-save-id", "a");
    root.append(card);
    expect(isLibraryBackgroundTarget(card)).toBe(false);
  });

  it("ignores clicks on interactive controls", () => {
    const viewport = document.createElement("div");
    viewport.setAttribute("data-library-grid-viewport", "");
    const controls: Array<HTMLElement> = [
      document.createElement("button"),
      document.createElement("a"),
      document.createElement("input"),
      document.createElement("textarea"),
    ];
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    controls.push(editable);
    viewport.append(...controls);
    for (const control of controls) {
      expect(isLibraryBackgroundTarget(control)).toBe(false);
    }
  });

  it("ignores clicks on a hover preview", () => {
    const root = document.createElement("div");
    root.setAttribute("data-library-grid", "");
    const preview = document.createElement("div");
    preview.setAttribute("role", "dialog");
    root.append(preview);
    expect(isLibraryBackgroundTarget(preview)).toBe(false);
  });
});
