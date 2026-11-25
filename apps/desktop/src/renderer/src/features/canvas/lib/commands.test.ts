import { describe, expect, it } from "vitest";
import { commandForKey, glyphsFor } from "./commands";
import type { KeyChord } from "./commands";
import { GRID } from "./document";

function press(code: string, modifiers: Partial<KeyChord> = {}): KeyChord {
  return {
    key: "",
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("canvas commands", () => {
  it("reads ⌥ chords by key code so the Mac keyboard's ⌥ glyphs still match", () => {
    expect(
      commandForKey({ ...press("KeyA", { altKey: true }), key: "å" }),
    ).toEqual({
      type: "align",
      edge: "left",
    });
  });

  it("keeps ⌘ chords apart from ⌃⌥ chords on the same letter", () => {
    expect(commandForKey(press("KeyH", { altKey: true }))).toEqual({
      type: "align",
      edge: "center",
    });
    expect(
      commandForKey(press("KeyH", { altKey: true, ctrlKey: true })),
    ).toEqual({ type: "distribute", axis: "horizontal" });
    expect(commandForKey(press("KeyT", { altKey: true, metaKey: true }))).toBe(
      null,
    );
  });

  it("treats Ctrl as ⌘ outside ⌃ chords", () => {
    expect(commandForKey(press("KeyD", { ctrlKey: true }))).toEqual({
      type: "duplicate",
    });
    expect(
      commandForKey(press("BracketRight", { ctrlKey: true, altKey: true })),
    ).toEqual({ type: "layer", move: "front" });
  });

  it("nudges by a pixel, or a grid step with Shift", () => {
    expect(commandForKey({ ...press("ArrowLeft"), key: "ArrowLeft" })).toEqual({
      type: "nudge",
      x: -1,
      y: 0,
    });
    expect(
      commandForKey({
        ...press("ArrowDown", { shiftKey: true }),
        key: "ArrowDown",
      }),
    ).toEqual({ type: "nudge", x: 0, y: GRID });
    expect(
      commandForKey({
        ...press("ArrowDown", { metaKey: true }),
        key: "ArrowDown",
      }),
    ).toBe(null);
  });

  it("adds a connected copy with ⌥ and an arrow", () => {
    expect(
      commandForKey({
        ...press("ArrowRight", { altKey: true }),
        key: "ArrowRight",
      }),
    ).toEqual({ type: "quick", side: "right" });
    expect(glyphsFor({ type: "quick", side: "top" })).toEqual(["⌥", "↑"]);
  });

  it("spells shortcuts in Mac modifier order", () => {
    expect(glyphsFor({ type: "distribute", axis: "vertical" })).toEqual([
      "⌃",
      "⌥",
      "V",
    ]);
    expect(glyphsFor({ type: "lock" })).toEqual(["⇧", "⌘", "L"]);
    expect(glyphsFor({ type: "layer", move: "forward" })).toBe(undefined);
  });
});
