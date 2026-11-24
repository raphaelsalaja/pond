import { PrefsSchema } from "@pond/schema";
import type { MenuItemSpec } from "@pond/ui";
import type { OkResult } from "@shared/query-contracts-shared";
import type { WirePrefsPatch } from "@shared/wire";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadPrefs } from "@/shared/state/prefs";
import { bridge } from "@/shared/test/pond-bridge";
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
const writes: Array<WirePrefsPatch> = [];
const waiters: Array<{
  match: (write: WirePrefsPatch) => boolean;
  resolve: () => void;
}> = [];
const notifications: Array<string> = [];
let notified = Promise.withResolvers<void>();

function written(match: (write: WirePrefsPatch) => boolean): Promise<void> {
  if (writes.some(match)) {
    return Promise.resolve();
  }
  const { promise, resolve } = Promise.withResolvers<void>();
  waiters.push({ match, resolve });
  return promise;
}

function hasTitle(detail: unknown): detail is { title: string } {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "title" in detail &&
    typeof detail.title === "string"
  );
}
const onNotification = (event: Event) => {
  if ("detail" in event && hasTitle(event.detail)) {
    notifications.push(event.detail.title);
    notified.resolve();
  }
};

beforeEach(async () => {
  colorResult = { ok: true };
  writes.length = 0;
  waiters.length = 0;
  notifications.length = 0;
  notified = Promise.withResolvers<void>();
  bridge.use({
    query: {
      "settings.getPrefs": () => PrefsSchema.parse(prefs),
      "settings.setPrefs": (input = {}) => {
        writes.push(input);
        prefs = {
          ...prefs,
          ...input,
          folderAppearance: {
            ...prefs.folderAppearance,
            ...input.folderAppearance,
          },
        };
        for (const waiter of waiters) {
          if (waiter.match(input)) {
            waiter.resolve();
          }
        }
        return { ok: true, prefs: PrefsSchema.parse(prefs) };
      },
      "folders.setColor": () => colorResult,
      "folders.list": () => [],
      "folders.memberships": () => [],
    },
  });
  window.addEventListener("pond:notification", onNotification);
  await loadPrefs();
});

afterEach(() => {
  window.removeEventListener("pond:notification", onNotification);
});

function group(items: Array<MenuItemSpec>): Array<MenuItemSpec> {
  const match = items.find((item) => item.type === "group");
  return match?.type === "group" ? match.items : [];
}

function labels(items: Array<MenuItemSpec>): Array<ReactNode> {
  return items.map((item) => ("label" in item ? item.label : null));
}

function pick(items: Array<MenuItemSpec>, label: string): void {
  const match = [...items, ...group(items)].find(
    (item) => "label" in item && item.label === label,
  );
  if (match?.type !== "checkbox") {
    throw new Error(`Missing item: ${label}`);
  }
  match.onCheckedChange?.(true);
}

function recentWrites(): Array<WirePrefsPatch["folderAppearance"]> {
  return writes.flatMap((write) => write.folderAppearance ?? []);
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
  await written((write) => write.folderAppearance !== undefined);
  expect(recentWrites()).toEqual([{ recentColors: ["#336699", "pink"] }]);
  expect(window.pond.query).toHaveBeenCalledWith("folders.setColor", {
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
  await notified.promise;
  expect(notifications).toEqual(["Couldn't update folder color"]);
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
  await Promise.all([
    written((write) => write.folderAppearance !== undefined),
    written((write) => write.folderViews !== undefined),
  ]);
  expect(recentWrites()).toEqual([
    { recentIcons: ["rocket", "heart", "folder"] },
  ]);
  expect(writes).toContainEqual({
    folderViews: { folder: expect.objectContaining({ icon: "rocket" }) },
  });
});
