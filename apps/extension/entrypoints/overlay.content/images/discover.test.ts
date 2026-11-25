import { expect, describe as group, it } from "vitest";
import {
  describe,
  facetCounts,
  imageFormat,
  imageName,
  largestSrcset,
  matchesFilters,
  sizeBucket,
} from "./discover";
import type { ImageFilters } from "./discover";

const filters: ImageFilters = {
  query: "",
  sizes: new Set(["large", "medium", "small"]),
  hiddenFormats: new Set(),
  hiddenDomains: new Set(),
  minWidth: 0,
  minHeight: 0,
};

const image = (url: string, width = 800, height = 600) =>
  describe({ url, alt: "", width, height });

group("image discovery", () => {
  it("reads the format from the extension or a format query", () => {
    expect(imageFormat("https://a.test/x/photo.JPEG")).toBe("JPG");
    expect(imageFormat("https://a.test/img?fm=webp&w=200")).toBe("WEBP");
    expect(imageFormat("https://a.test/img/123")).toBe("Other");
  });

  it("names an image after its file", () => {
    expect(imageName("https://a.test/a/My%20Photo.png?w=1")).toBe("My Photo");
    expect(imageName("https://cdn.a.test/")).toBe("cdn.a.test");
  });

  it("buckets by the longest edge", () => {
    expect(sizeBucket(1200, 10)).toBe("large");
    expect(sizeBucket(300, 400)).toBe("medium");
    expect(sizeBucket(399, 399)).toBe("small");
  });

  it("picks the widest srcset entry", () => {
    expect(
      largestSrcset("a.jpg 320w, b.jpg 1280w, c.jpg 640w", "https://a.test/p/"),
    ).toBe("https://a.test/p/b.jpg");
    expect(largestSrcset("a.jpg, b.jpg 2x", "https://a.test/")).toBe(
      "https://a.test/b.jpg",
    );
  });
});

group("image filters", () => {
  it("drops tracking pixels and hidden sizes", () => {
    expect(matchesFilters(image("https://a.test/p.gif", 1, 1), filters)).toBe(
      false,
    );
    expect(
      matchesFilters(image("https://a.test/big.png", 2000, 900), {
        ...filters,
        sizes: new Set(["small"]),
      }),
    ).toBe(false);
  });

  it("keeps images whose size is still unknown", () => {
    expect(
      matchesFilters(image("https://a.test/lazy.png", 0, 0), {
        ...filters,
        sizes: new Set(),
        minWidth: 500,
      }),
    ).toBe(true);
  });

  it("filters by format, domain, minimum size, and search", () => {
    const photo = image("https://www.cdn.test/sunset.jpg");
    expect(
      matchesFilters(photo, { ...filters, hiddenFormats: new Set(["JPG"]) }),
    ).toBe(false);
    expect(
      matchesFilters(photo, {
        ...filters,
        hiddenDomains: new Set(["cdn.test"]),
      }),
    ).toBe(false);
    expect(matchesFilters(photo, { ...filters, minWidth: 801 })).toBe(false);
    expect(matchesFilters(photo, { ...filters, query: "SUN" })).toBe(true);
    expect(matchesFilters(photo, { ...filters, query: "moon" })).toBe(false);
  });

  it("counts each facet with how many are selected", () => {
    const images = [
      image("https://a.test/1.png"),
      image("https://a.test/2.png"),
      image("https://a.test/3.jpg"),
    ];
    expect(
      facetCounts(images, new Set(["https://a.test/2.png"]), (i) => i.format),
    ).toEqual([
      { id: "PNG", total: 2, selected: 1 },
      { id: "JPG", total: 1, selected: 0 },
    ]);
  });
});
