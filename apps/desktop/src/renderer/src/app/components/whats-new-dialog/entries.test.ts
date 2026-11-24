import { parseChangelogEntry } from "@pond/schema/changelog";
import { describe, expect, it } from "vitest";
import {
  CHANGELOG,
  CHANGELOG_FILE_COUNT,
  mediaUrl,
  unseenVersions,
} from "./entries";

const ENTRY = `---
version: 2.13.0
date: 2026-10-09
title: Find more in your library
summary: Find related captures, search PDFs, and save batches more easily.
media: 2.13.0.mp4
---

## New

- Search within PDFs with ⌘F.

## Fixed

- Images sharpen sooner while scrolling.
`;

const entries = ["1.5.0", "1.4.1", "1.4.0", "1.3.0"].map((version) =>
  parseChangelogEntry(ENTRY.replace("2.13.0", version)),
);

describe("bundled changelog", () => {
  it("parses every entry in changelog/", () => {
    expect(CHANGELOG.length).toBe(CHANGELOG_FILE_COUNT);
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("bundles every entry's media from changelog/media/", () => {
    const missing = CHANGELOG.filter((entry) => !mediaUrl(entry));
    expect(missing.map((entry) => entry.media)).toEqual([]);
  });
});

describe("parseChangelogEntry", () => {
  it("reads frontmatter and categorized items", () => {
    expect(parseChangelogEntry(ENTRY)).toEqual({
      version: "2.13.0",
      date: "2026-10-09",
      title: "Find more in your library",
      summary:
        "Find related captures, search PDFs, and save batches more easily.",
      media: "2.13.0.mp4",
      sections: [
        { category: "new", items: ["Search within PDFs with ⌘F."] },
        {
          category: "fixed",
          items: ["Images sharpen sooner while scrolling."],
        },
      ],
    });
  });

  it("rejects an unknown category", () => {
    expect(() =>
      parseChangelogEntry(ENTRY.replace("## Fixed", "## Security")),
    ).toThrow(/Unknown changelog section/);
  });

  it("rejects categories out of order", () => {
    expect(() =>
      parseChangelogEntry(
        ENTRY.replace("## New", "## Tmp")
          .replace("## Fixed", "## New")
          .replace("## Tmp", "## Fixed"),
      ),
    ).toThrow(/order/);
  });

  it("rejects a missing summary", () => {
    expect(() =>
      parseChangelogEntry(ENTRY.replace(/summary: .*\n/, "")),
    ).toThrow();
  });

  it("rejects missing media", () => {
    expect(() =>
      parseChangelogEntry(ENTRY.replace(/media: .*\n/, "")),
    ).toThrow();
  });
});

describe("unseenVersions", () => {
  it("lists every release since the last version you saw", () => {
    expect(
      unseenVersions({
        entries,
        current: "1.5.0",
        lastSeen: "1.4.0",
        hasSaves: true,
      }),
    ).toEqual(["1.5.0", "1.4.1"]);
  });

  it("shows only the current release on the first run of an existing Library", () => {
    expect(
      unseenVersions({
        entries,
        current: "1.4.1",
        lastSeen: null,
        hasSaves: true,
      }),
    ).toEqual(["1.4.1"]);
  });

  it("stays closed on a fresh install", () => {
    expect(
      unseenVersions({
        entries,
        current: "1.4.1",
        lastSeen: null,
        hasSaves: false,
      }),
    ).toEqual([]);
  });

  it("stays closed on prerelease builds", () => {
    expect(
      unseenVersions({
        entries,
        current: "1.5.1-beta.1",
        lastSeen: "1.4.0",
        hasSaves: true,
      }),
    ).toEqual([]);
  });
});
