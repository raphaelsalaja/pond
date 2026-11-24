import { describe, expect, it, vi } from "vitest";
import { resolveMenus } from "./menus-api";

function menuNamespace() {
  return { create: vi.fn(), removeAll: vi.fn() };
}

describe("menus API resolution", () => {
  it("uses contextMenus on engines that expose it", () => {
    const contextMenus = menuNamespace();
    expect(resolveMenus({ contextMenus, menus: menuNamespace() })).toBe(
      contextMenus,
    );
  });

  it("falls back to Safari's menus namespace", () => {
    const menus = menuNamespace();
    expect(resolveMenus({ menus })).toBe(menus);
  });

  it("throws when the browser has neither namespace", () => {
    expect(() => resolveMenus({})).toThrow(
      "No context-menu API in this browser.",
    );
  });
});
