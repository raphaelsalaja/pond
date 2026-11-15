import { describe, expect, it } from "vitest";
import { libraryEmptyKind } from "./kind";

const library = {
  mode: "library" as const,
  navKind: "all" as const,
  hasActiveSearch: false,
  hasActiveFilter: false,
  libraryTotal: 13144,
};

describe("libraryEmptyKind", () => {
  it("treats an empty folder as a folder, not a failed search", () => {
    expect(
      libraryEmptyKind({
        ...library,
        navKind: "folder",
      }),
    ).toBe("folder");
  });

  it("keeps search empty copy when a folder has filters applied", () => {
    expect(
      libraryEmptyKind({
        ...library,
        navKind: "folder",
        hasActiveFilter: true,
      }),
    ).toBe("matches");
  });

  it("still invites import when the folder is empty and the library is too", () => {
    expect(
      libraryEmptyKind({
        ...library,
        navKind: "folder",
        libraryTotal: 0,
      }),
    ).toBe("folder");
  });

  it("confirms a clear Inbox instead of reporting a failed search", () => {
    expect(libraryEmptyKind({ ...library, navKind: "inbox" })).toBe("inbox");
    expect(
      libraryEmptyKind({ ...library, navKind: "inbox", hasActiveSearch: true }),
    ).toBe("matches");
  });

  it("confirms a clear Inbox when the Inbox query itself returns nothing", () => {
    expect(
      libraryEmptyKind({ ...library, navKind: "inbox", libraryTotal: 0 }),
    ).toBe("inbox");
  });

  it("keeps the all-library empty state", () => {
    expect(libraryEmptyKind({ ...library, libraryTotal: 0 })).toBe("library");
  });
});
