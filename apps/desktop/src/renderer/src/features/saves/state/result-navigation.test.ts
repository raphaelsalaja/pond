import { afterEach, expect, it, vi } from "vitest";
import { resultNavigation } from "./result-navigation";

afterEach(() => {
  resultNavigation.setSource({ ids: [] });
});

it("uses loaded neighbors and resolves the full query only at a page boundary", async () => {
  const allIds = vi.fn(async () => ["a", "b", "c"]);
  resultNavigation.setSource({ ids: ["a", "b"], allIds });
  expect(await resultNavigation.next("a", 1)).toBe("b");
  expect(allIds).not.toHaveBeenCalled();
  expect(await resultNavigation.next("b", 1)).toBe("c");
  expect(await resultNavigation.next("a", -1)).toBeNull();
});

it("reports the current result position against the full result count", () => {
  resultNavigation.setSource({ ids: ["a", "b"], total: 493 });
  expect(resultNavigation.indexOf("a")).toBe(0);
  expect(resultNavigation.indexOf("b")).toBe(1);
  expect(resultNavigation.total()).toBe(493);
});

it("loads an unloaded result and retries reveal when virtual geometry arrives", async () => {
  const loadMore = vi.fn(async () => {});
  resultNavigation.setSource({ ids: ["a"], loadMore });
  await resultNavigation.reveal("b");
  expect(loadMore).toHaveBeenCalledTimes(1);
  const reveal = vi.fn((id: string) => resultNavigation.didReveal(id));
  const unregister = resultNavigation.registerReveal(reveal);
  expect(reveal).toHaveBeenCalledWith("b");
  unregister();
  const second = vi.fn();
  resultNavigation.registerReveal(second)();
  expect(second).not.toHaveBeenCalled();
});

it("reveals a logical item beyond multiple unloaded pages", async () => {
  let ids = ["a"];
  const pages = [["b"], ["c"], ["d"]];
  const loadMore = vi.fn(async () => {
    ids = [...ids, ...(pages.shift() ?? [])];
  });
  resultNavigation.setSource({
    key: "one",
    ids,
    loadedIds: () => ids,
    loadMore,
  });
  const shown = vi.fn();
  const off = resultNavigation.registerReveal(shown);
  await resultNavigation.reveal("d");
  expect(loadMore).toHaveBeenCalledTimes(3);
  expect(shown).toHaveBeenLastCalledWith("d");
  off();
});

it("abandons a pending reveal when navigation changes scope", async () => {
  const shown = vi.fn();
  const off = resultNavigation.registerReveal(shown);
  resultNavigation.setSource({
    key: "old",
    ids: ["a"],
    loadMore: async () => {
      resultNavigation.setSource({ key: "new", ids: ["x"] });
    },
  });
  await resultNavigation.reveal("b");
  expect(shown).not.toHaveBeenCalled();
  off();
});

it("moves to the next remaining result when the watched one leaves", () => {
  resultNavigation.setSource({ key: "folder", ids: ["a", "b", "c"] });
  const onLeave = vi.fn();
  const off = resultNavigation.watchDeparture("b", onLeave);
  resultNavigation.setSource({ key: "folder", ids: ["a", "b", "c", "d"] });
  expect(onLeave).not.toHaveBeenCalled();
  resultNavigation.setSource({ key: "folder", ids: ["a", "c", "d"] });
  expect(onLeave).toHaveBeenCalledExactlyOnceWith("c");
  off();
});

it("falls back to the previous result, then to nothing", () => {
  resultNavigation.setSource({ key: "folder", ids: ["a", "b"] });
  const last = vi.fn();
  const offLast = resultNavigation.watchDeparture("b", last);
  resultNavigation.setSource({ key: "folder", ids: ["a"] });
  expect(last).toHaveBeenCalledExactlyOnceWith("a");
  offLast();
  const only = vi.fn();
  const offOnly = resultNavigation.watchDeparture("a", only);
  resultNavigation.setSource({ key: "folder", ids: [] });
  expect(only).toHaveBeenCalledExactlyOnceWith(null);
  offOnly();
});

it("ignores a result that leaves because the scope changed", () => {
  resultNavigation.setSource({ key: "folder", ids: ["a", "b"] });
  const onLeave = vi.fn();
  const off = resultNavigation.watchDeparture("a", onLeave);
  resultNavigation.setSource({ key: "trash", ids: ["x"] });
  resultNavigation.setSource({ key: "trash", ids: [] });
  expect(onLeave).not.toHaveBeenCalled();
  off();
});
