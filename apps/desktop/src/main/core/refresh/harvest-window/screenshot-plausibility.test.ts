import { describe, expect, it } from "vitest";
import {
  postCardFilePlausible,
  postCardRectPlausible,
} from "./screenshot-plausibility";

describe("postCardRectPlausible", () => {
  it("rejects the Threads wordmark geometry behind the broken fallback captures", () => {
    /** The 276x194 padded files imply a measured element tens of css px wide at any display scale. */
    expect(postCardRectPlausible({ width: 66, height: 25 })).toBe(false);
    expect(postCardRectPlausible({ width: 44, height: 17 })).toBe(false);
    expect(postCardRectPlausible({ width: 92, height: 24 })).toBe(false);
  });

  it("rejects chrome slivers that pass the width floor", () => {
    expect(postCardRectPlausible({ width: 600, height: 20 })).toBe(false);
  });

  it("accepts a short text-only post card", () => {
    expect(postCardRectPlausible({ width: 500, height: 110 })).toBe(true);
  });

  it("accepts a typical post card column", () => {
    expect(postCardRectPlausible({ width: 580, height: 400 })).toBe(true);
    expect(postCardRectPlausible({ width: 620, height: 2400 })).toBe(true);
  });

  it("accepts the floor exactly and rejects just below it", () => {
    expect(postCardRectPlausible({ width: 200, height: 48 })).toBe(true);
    expect(postCardRectPlausible({ width: 199, height: 48 })).toBe(false);
    expect(postCardRectPlausible({ width: 200, height: 47 })).toBe(false);
  });
});

describe("postCardFilePlausible", () => {
  it("rejects the 276x194 wordmark files recorded in the broken saves", () => {
    expect(postCardFilePlausible({ width: 276, height: 194 })).toBe(false);
  });

  it("rejects on width alone, the robust signal", () => {
    expect(postCardFilePlausible({ width: 276, height: null })).toBe(false);
    expect(postCardFilePlausible({ width: 300, height: 900 })).toBe(false);
  });

  it("rejects height slivers", () => {
    expect(postCardFilePlausible({ width: 1800, height: 150 })).toBe(false);
  });

  it("accepts a short text-only post card file at the minimum display scale", () => {
    /** A 500x110 css card on a scale-1 display pads to 644x254 output pixels. */
    expect(postCardFilePlausible({ width: 644, height: 254 })).toBe(true);
  });

  it("accepts typical post card files", () => {
    expect(postCardFilePlausible({ width: 1884, height: 1344 })).toBe(true);
    expect(postCardFilePlausible({ width: 1196, height: null })).toBe(true);
  });

  it("accepts the floor exactly and rejects just below it", () => {
    expect(postCardFilePlausible({ width: 344, height: 192 })).toBe(true);
    expect(postCardFilePlausible({ width: 343, height: 192 })).toBe(false);
    expect(postCardFilePlausible({ width: 344, height: 191 })).toBe(false);
  });

  it("cannot judge files recorded without dimensions", () => {
    expect(postCardFilePlausible({ width: null, height: null })).toBe(true);
    expect(postCardFilePlausible({})).toBe(true);
  });
});
