import { PrefsSchema } from "@pond/schema";
import type { WirePrefsPatch } from "@shared/wire";
import { beforeEach, expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import {
  rememberFolderColor,
  rememberFolderIcon,
  withRecent,
} from "./folder-appearance";

let stored: WirePrefsPatch = {
  folderAppearance: { recentIcons: ["star"], recentColors: ["pink"] },
};

beforeEach(() => {
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse(stored),
      "settings.setPrefs": (input = {}) => {
        stored = {
          folderAppearance: {
            ...stored.folderAppearance,
            ...input.folderAppearance,
          },
        };
        return { ok: true, prefs: PrefsSchema.parse(stored) };
      },
    },
  });
});

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
  expect(window.pond.query).toHaveBeenCalledWith("settings.setPrefs", {
    folderAppearance: { recentIcons: ["album", "star"] },
  });
  await rememberFolderColor("#AB12CD");
  expect(window.pond.query).toHaveBeenCalledWith("settings.setPrefs", {
    folderAppearance: { recentColors: ["#ab12cd", "pink"] },
  });
});

it("skips the default color", async () => {
  await rememberFolderColor(null);
  expect(window.pond.query).not.toHaveBeenCalled();
});

it("never rejects when the write fails", async () => {
  const offline = async () => {
    throw new Error("offline");
  };
  bridge.use({
    query: { "settings.getPrefs": offline, "settings.setPrefs": offline },
  });
  await expect(rememberFolderIcon("star")).resolves.toBeUndefined();
});
