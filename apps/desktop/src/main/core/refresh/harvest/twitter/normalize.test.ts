import { describe, expect, it } from "vitest";
import { inPageTwitterNormalize } from "./normalize";

const { parseMetric } = inPageTwitterNormalize();

describe("parseMetric", () => {
  it("reads compact counts", () => {
    expect(parseMetric("1.2K")).toBe(1200);
    expect(parseMetric("3M Views")).toBe(3_000_000);
    expect(parseMetric("2,450 Likes. Like")).toBe(2450);
  });

  it("does not read the B of Bookmarks as billions", () => {
    expect(parseMetric("48 Bookmarks. Bookmark")).toBe(48);
    expect(parseMetric("1 Bookmark")).toBe(1);
    expect(parseMetric("2.4K Bookmarks")).toBe(2400);
  });
});
