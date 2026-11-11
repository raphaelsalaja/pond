import { describe, expect, it } from "vitest";
import { scrollClampSpace } from "./scroll-clamp";

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
