import { describe, expect, it } from "vitest";
import { arenaLinkUrl, isWebPageSave } from "./web-page-save";

const LINKED = "https://en.wikipedia.org/wiki/Community_Memory";

describe("arenaLinkUrl", () => {
  it("returns the page an Are.na Link block points at", () => {
    expect(
      arenaLinkUrl({
        source: "arena",
        url: LINKED,
        extras: { blockClass: "Link" },
      }),
    ).toBe(LINKED);
  });

  it("ignores other block classes, even when they name a source page", () => {
    for (const blockClass of ["Image", "Text", "Attachment", "Media"]) {
      expect(
        arenaLinkUrl({ source: "arena", url: LINKED, extras: { blockClass } }),
      ).toBeNull();
    }
  });

  it("ignores Link blocks that point back at are.na or at a non-web address", () => {
    for (const url of [
      "https://www.are.na/ada/influences",
      "mailto:ada@example.com",
      "not a url",
    ]) {
      expect(
        arenaLinkUrl({ source: "arena", url, extras: { blockClass: "Link" } }),
      ).toBeNull();
    }
  });

  it("ignores other Sources", () => {
    expect(
      arenaLinkUrl({
        source: "cosmos",
        url: LINKED,
        extras: { blockClass: "Link" },
      }),
    ).toBeNull();
  });
});

describe("isWebPageSave", () => {
  it("treats direct web Saves and harvested Are.na Link blocks as web pages", () => {
    expect(isWebPageSave({ source: "web", url: LINKED })).toBe(true);
    expect(isWebPageSave({ source: "arena", url: LINKED })).toBe(true);
  });

  it("keeps Are.na blocks that still open on are.na as Are.na Saves", () => {
    expect(
      isWebPageSave({
        source: "arena",
        url: "https://www.are.na/block/2824521",
      }),
    ).toBe(false);
    expect(
      isWebPageSave({ source: "twitter", url: "https://x.com/a/status/1" }),
    ).toBe(false);
  });
});
