import { describe, expect, it } from "vitest";
import { scrollClampFloor, scrollClampSpace } from "./scroll-clamp";

describe("sidebar scroll clamp", () => {
  it("holds a scroll position that collapsed content no longer reaches", () => {
    expect(
      scrollClampSpace({
        scrollTop: 600,
        clientHeight: 400,
        content: 820,
        previousContent: 1000,
        space: 0,
      }),
    ).toBe(180);
  });

  it("leaves the position alone when the content still reaches it", () => {
    expect(
      scrollClampSpace({
        scrollTop: 100,
        clientHeight: 400,
        content: 820,
        previousContent: 1000,
        space: 0,
      }),
    ).toBeNull();
  });

  it("ignores growth, user scrolling, and viewport resizes", () => {
    expect(
      scrollClampSpace({
        scrollTop: 600,
        clientHeight: 500,
        content: 1000,
        previousContent: 1000,
        space: 0,
      }),
    ).toBeNull();
    expect(
      scrollClampSpace({
        scrollTop: 600,
        clientHeight: 400,
        content: 1200,
        previousContent: 1000,
        space: 0,
      }),
    ).toBeNull();
  });

  it("extends a spacer that is still easing when content shrinks again", () => {
    expect(
      scrollClampSpace({
        scrollTop: 600,
        clientHeight: 400,
        content: 700,
        previousContent: 820,
        space: 120,
      }),
    ).toBe(300);
    expect(
      scrollClampSpace({
        scrollTop: 520,
        clientHeight: 400,
        content: 800,
        previousContent: 820,
        space: 150,
      }),
    ).toBeNull();
  });

  it("eases a near-top clamp when the list no longer fills the viewport", () => {
    const input = {
      scrollTop: 24,
      clientHeight: 400,
      content: 400,
      previousContent: 980,
      space: 0,
      natural: 260,
    };
    expect(scrollClampSpace(input)).toBe(164);
    expect(scrollClampFloor(input)).toBe(140);
  });

  it("eases a few pixels of overflow by that distance", () => {
    expect(
      scrollClampSpace({
        scrollTop: 24,
        clientHeight: 400,
        content: 260,
        previousContent: 980,
        space: 0,
      }),
    ).toBe(164);
  });

  it("does not animate a collapse that starts at the top", () => {
    expect(
      scrollClampSpace({
        scrollTop: 0,
        clientHeight: 400,
        content: 260,
        previousContent: 980,
        space: 0,
      }),
    ).toBeNull();
    expect(
      scrollClampSpace({
        scrollTop: 0,
        clientHeight: 400,
        content: 400,
        previousContent: 980,
        space: 0,
        natural: 260,
      }),
    ).toBeNull();
  });

  it("leaves no floor to ease through when the content still overflows", () => {
    expect(
      scrollClampFloor({
        clientHeight: 400,
        content: 820,
      }),
    ).toBe(0);
  });

  it("rounds a fractional scroll position up to whole pixels", () => {
    expect(
      scrollClampSpace({
        scrollTop: 600.4,
        clientHeight: 400,
        content: 820,
        previousContent: 1000,
        space: 0,
      }),
    ).toBe(181);
  });
});
