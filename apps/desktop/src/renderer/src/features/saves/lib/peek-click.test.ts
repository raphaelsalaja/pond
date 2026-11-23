import { describe, expect, it } from "vitest";
import { isPeekClick } from "./peek-click";

const click = (
  keys: Partial<Record<"altKey" | "shiftKey" | "metaKey" | "ctrlKey", boolean>>,
) => ({
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...keys,
});

describe("isPeekClick", () => {
  it("matches only the chosen modifiers", () => {
    expect(isPeekClick(click({ altKey: true }), "option")).toBe(true);
    expect(isPeekClick(click({ altKey: true, shiftKey: true }), "option")).toBe(
      false,
    );
    expect(
      isPeekClick(click({ altKey: true, shiftKey: true }), "option-shift"),
    ).toBe(true);
    expect(
      isPeekClick(click({ altKey: true, metaKey: true }), "option-command"),
    ).toBe(true);
    expect(
      isPeekClick(click({ altKey: true, ctrlKey: true }), "option-command"),
    ).toBe(true);
    expect(isPeekClick(click({ altKey: true }), "option-command")).toBe(false);
  });

  it("leaves plain, Shift and Command clicks to selection", () => {
    expect(isPeekClick(click({}), "option")).toBe(false);
    expect(isPeekClick(click({ shiftKey: true }), "option-shift")).toBe(false);
    expect(isPeekClick(click({ metaKey: true }), "option-command")).toBe(false);
  });

  it("never matches when turned off", () => {
    expect(isPeekClick(click({ altKey: true }), "off")).toBe(false);
  });
});
