import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nextRating, Rating } from ".";

describe("Rating", () => {
  it("jumps and clears from the keyboard", () => {
    expect(nextRating("End")).toBe(5);
    expect(nextRating("Home")).toBe(1);
    expect(nextRating("Backspace")).toBe(0);
    expect(nextRating("4")).toBe(4);
    expect(nextRating("9")).toBeNull();
    expect(nextRating("ArrowRight")).toBeNull();
  });

  it("marks the chosen star and fills the stars up to it", () => {
    const markup = renderToStaticMarkup(
      <Rating value={3} onValueChange={() => {}} />,
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(markup.match(/data-filled=/g)).toHaveLength(3);
  });

  it("names a mixed value and checks no star", () => {
    const markup = renderToStaticMarkup(
      <Rating value={null} onValueChange={() => {}} />,
    );
    expect(markup).toContain('aria-label="Rating, multiple values"');
    expect(markup).not.toContain('aria-checked="true"');
    expect(markup).not.toContain("data-filled=");
  });
});
