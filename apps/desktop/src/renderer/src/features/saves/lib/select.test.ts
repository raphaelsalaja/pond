import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { primarySelection, selection } from "@/features/saves/state/selection";
import {
  clearSaveSelection,
  clickSave,
  isLibraryBackgroundTarget,
  pickSave,
  selectOnlySave,
} from "./select";

beforeEach(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  });
  selection.clear();
  primarySelection.set(null);
});

afterEach(() => {
  selection.clear();
  primarySelection.set(null);
  vi.unstubAllGlobals();
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

describe("isLibraryBackgroundTarget", () => {
  it("treats empty grid space as a background click", () => {
    const root = document.createElement("div");
    root.setAttribute("data-library-grid", "");
    const gap = document.createElement("div");
    root.append(gap);
    expect(isLibraryBackgroundTarget(gap)).toBe(true);
  });

  it("ignores clicks on a save card", () => {
    const root = document.createElement("div");
    root.setAttribute("data-library-grid", "");
    const card = document.createElement("li");
    card.setAttribute("data-save-id", "a");
    root.append(card);
    expect(isLibraryBackgroundTarget(card)).toBe(false);
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
