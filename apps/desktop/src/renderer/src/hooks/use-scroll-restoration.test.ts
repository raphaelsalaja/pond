// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recallScroll,
  recallScrollAnchor,
  rememberScroll,
  rememberScrollAnchor,
} from "./use-scroll-restoration";

const STORAGE_KEY = "pond.scrollPositions:v1:unbound";
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    clear: () => stored.clear(),
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  } as Pick<Storage, "clear" | "getItem" | "setItem">,
});

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  window.localStorage.clear();
});

describe("scroll restoration", () => {
  it("keeps independent offsets per tab and route", () => {
    rememberScroll("tab-a:/", 820);
    rememberScroll("tab-b:/", 140);
    rememberScroll("tab-a:/trash", 360);

    expect(recallScroll("tab-a:/")).toBe(820);
    expect(recallScroll("tab-b:/")).toBe(140);
    expect(recallScroll("tab-a:/trash")).toBe(360);
  });

  it("clamps invalid negative offsets", () => {
    rememberScroll("tab-a:/sources", -20);
    expect(recallScroll("tab-a:/sources")).toBe(0);
  });

  it("flushes remembered offsets before a renderer reload", () => {
    rememberScroll("tab-reload:/", 4321);
    window.dispatchEvent(new Event("pagehide"));

    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"),
    ).toContainEqual(["tab-reload:/", { top: 4321 }]);
  });

  it("hydrates an offset saved by a previous renderer", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([["tab-restored:/", 6789]]),
    );
    vi.resetModules();
    const fresh = await import("./use-scroll-restoration");

    expect(fresh.recallScroll("tab-restored:/")).toBe(6789);
  });

  it("persists a card identity anchor with its pixel fallback", () => {
    rememberScrollAnchor("tab-anchor:/", 7000, {
      id: "save-123",
      offset: 42,
    });

    expect(recallScroll("tab-anchor:/")).toBe(7000);
    expect(recallScrollAnchor("tab-anchor:/")).toEqual({
      id: "save-123",
      offset: 42,
    });
    /** Later pixel saves must retain the identity anchor. */
    rememberScroll("tab-anchor:/", 7010);
    expect(recallScrollAnchor("tab-anchor:/")).toEqual({
      id: "save-123",
      offset: 42,
    });
  });
});
