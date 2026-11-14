import type { MenuItemSpec } from "@pond/ui";
import type { OkResult } from "@shared/query-contracts-shared";
import type { WirePrefsPatch } from "@shared/wire";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPrefs } from "@/shared/state/prefs";
import {
  folderColorMenuItems,
  folderIconMenuItems,
} from "./folder-appearance-menu";

let prefs: WirePrefsPatch = {
  folderAppearance: {
    recentIcons: ["heart", "folder", "rocket"],
    recentColors: ["#336699", "pink"],
  },
};
let colorResult: OkResult = { ok: true };
const query = vi.fn(async (name: string, input: WirePrefsPatch) => {
  if (name === "settings.getPrefs") return prefs;
  if (name === "settings.setPrefs") {
    prefs = {
      ...prefs,
      ...input,
      folderAppearance: {
        ...prefs.folderAppearance,
        ...input.folderAppearance,
      },
    };
    return { prefs };
  }
  if (name === "folders.setColor") return colorResult;
  return [];
});
const notifications: string[] = [];
const onNotification = (event: Event) => {
  if (event instanceof CustomEvent) notifications.push(event.detail.title);
};

beforeEach(async () => {
  query.mockClear();
  colorResult = { ok: true };
  notifications.length = 0;
  vi.stubGlobal("pond", { query });
  window.addEventListener("pond:notification", onNotification);
  await loadPrefs();
});

afterEach(() => {
  window.removeEventListener("pond:notification", onNotification);
  vi.unstubAllGlobals();
});

function group(items: MenuItemSpec[]): MenuItemSpec[] {
  const match = items.find((item) => item.type === "group");
  return match?.type === "group" ? match.items : [];
}

function labels(items: MenuItemSpec[]): ReactNode[] {
  return items.map((item) => ("label" in item ? item.label : null));
}

function pick(items: MenuItemSpec[], label: string): void {
  const match = [...items, ...group(items)].find(
    (item) => "label" in item && item.label === label,
  );
  if (match?.type !== "checkbox") throw new Error(`Missing item: ${label}`);
  match.onCheckedChange?.(true);
}

function writes(): WirePrefsPatch[] {
  return query.mock.calls.flatMap(([name, input]) =>
    name === "settings.setPrefs" ? [input] : [],
  );
}

function recentWrites(): WirePrefsPatch["folderAppearance"][] {
  return writes().flatMap((write) => write.folderAppearance ?? []);
}

it("lists recent and current custom colors by hex", () => {
  const items = folderColorMenuItems({
    folder: { id: "folder", color: "#ab12cd" },
    glyphs: true,
  });
  expect(labels(group(items))).toEqual(["#336699", "#AB12CD"]);
  expect(group(items)[1]).toMatchObject({ type: "checkbox", checked: true });
});

it("records a color once the folder accepts it", async () => {
  const items = folderColorMenuItems({
    folder: { id: "folder", color: null },
    glyphs: false,
  });
  pick(items, "#336699");
  await vi.waitFor(() =>
    expect(recentWrites()).toEqual([{ recentColors: ["#336699", "pink"] }]),
  );
  expect(query).toHaveBeenCalledWith("folders.setColor", {
    id: "folder",
    color: "#336699",
  });
});

it("reports a rejected color without recording it", async () => {
  colorResult = { ok: false, error: "Folder not found." };
  const items = folderColorMenuItems({
    folder: { id: "folder", color: null },
    glyphs: false,
  });
  pick(items, "Teal");
  await vi.waitFor(() =>
    expect(notifications).toEqual(["Couldn't update folder color"]),
  );
  expect(recentWrites()).toEqual([]);
});

it("adds recent and current icons after the menu's fixed set", async () => {
  const items = folderIconMenuItems({
    folderId: "folder",
    icon: "camera",
    glyphs: false,
  });
  expect(labels(group(items))).toEqual(["Heart", "Rocket", "Camera"]);
  pick(items, "Rocket");
  await vi.waitFor(() =>
    expect(recentWrites()).toEqual([
      { recentIcons: ["rocket", "heart", "folder"] },
    ]),
  );
  expect(writes()).toContainEqual({
    folderViews: { folder: expect.objectContaining({ icon: "rocket" }) },
  });
});
