import { expect, it } from "vitest";
import { libraryMenuLabels } from "./library-menu";

it("exposes create, switch, backup, restore, merge, and verify", () => {
  expect(libraryMenuLabels(true)).toEqual([
    "New Library",
    "Open Library",
    "Reveal Library in Finder",
    "Move Library",
    "Rescan Library",
    "Reload Library",
    "Verify Integrity",
    "Backup",
    "Restore",
    "Merge Library",
    "Empty Trash",
    "Restore All from Trash",
    "Clear History",
  ]);
});

it("uses File Explorer language on Windows", () => {
  expect(libraryMenuLabels(false)[2]).toBe("Reveal Library in File Explorer");
});
