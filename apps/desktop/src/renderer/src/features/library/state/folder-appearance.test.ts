import type { WirePrefsPatch } from "@shared/wire";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  rememberFolderColor,
  rememberFolderIcon,
  withRecent,
} from "./folder-appearance";

const query = vi.fn();
let stored: WirePrefsPatch = {
  folderAppearance: { recentIcons: ["star"], recentColors: ["pink"] },
};

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (name: string, input: WirePrefsPatch) => {
    if (name !== "settings.setPrefs") return stored;
    stored = {
      folderAppearance: {
        ...stored.folderAppearance,
        ...input.folderAppearance,
      },
    };
    return { prefs: stored };
  });
  vi.stubGlobal("pond", { query });
});

afterEach(() => vi.unstubAllGlobals());

it("puts the newest pick first without duplicates", () => {
  expect(withRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  expect(withRecent(["a", "b"], "d")).toEqual(["d", "a", "b"]);
});

it("keeps one picker row of recents", () => {
  const full = ["1", "2", "3", "4", "5", "6", "7", "8"];
  expect(withRecent(full, "9")).toEqual(["9", ...full.slice(0, 7)]);
});

it("records icons and normalized custom colors", async () => {
  await rememberFolderIcon("album");
  expect(query).toHaveBeenCalledWith("settings.setPrefs", {
    folderAppearance: { recentIcons: ["album", "star"] },
  });
  await rememberFolderColor("#AB12CD");
  expect(query).toHaveBeenCalledWith("settings.setPrefs", {
    folderAppearance: { recentColors: ["#ab12cd", "pink"] },
  });
});

it("skips the default color", async () => {
  await rememberFolderColor(null);
  expect(query).not.toHaveBeenCalled();
});

it("never rejects when the write fails", async () => {
  query.mockRejectedValue(new Error("offline"));
  await expect(rememberFolderIcon("star")).resolves.toBeUndefined();
});
