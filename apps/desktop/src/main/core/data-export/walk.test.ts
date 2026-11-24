import { describe, expect, it } from "vitest";
import { exportDate, parseJsonText, walkJson } from "./walk";

describe("walkJson", () => {
  it("visits every object with the keys that lead to it", () => {
    const seen: Array<string> = [];
    walkJson({ a: { b: [{ c: 1 }] } }, (_value, keys) => {
      seen.push(keys.join("/"));
    });
    expect(seen).toEqual(["", "a", "a/b/0"]);
  });
});

describe("parseJsonText", () => {
  it("reads JSON and returns null for anything else", () => {
    expect(parseJsonText('{"a":[1]}')).toEqual({ a: [1] });
    expect(parseJsonText("garbage")).toBeNull();
  });
});

describe("exportDate", () => {
  it("reads seconds, milliseconds, and TikTok's space-separated UTC time", () => {
    expect(exportDate(1_700_000_000)?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    expect(exportDate(1_700_000_000_000)?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    expect(exportDate("2024-03-01 18:22:10")?.toISOString()).toBe(
      "2024-03-01T18:22:10.000Z",
    );
    expect(exportDate("nope")).toBeNull();
    expect(exportDate(undefined)).toBeNull();
  });
});
