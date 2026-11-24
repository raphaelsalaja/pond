import type { MenuItemSpec } from "@pond/ui";
import { afterEach, expect, it, vi } from "vitest";
import { folders } from "@/features/library/state/folders";
import { buildMoveFolderItems } from "./move-folders-menu";

function row(id: string, parentId: string | null) {
  return {
    id,
    name: id,
    parentId,
    color: null,
    sortOrder: 0,
    createdAt: new Date(),
  };
}

function flatten(items: Array<MenuItemSpec>): Array<[string, boolean]> {
  return items.flatMap((item): Array<[string, boolean]> => {
    if (item.type === "submenu") {
      return flatten(item.items);
    }
    if (!("label" in item)) {
      return [];
    }
    return [[String(item.label), "disabled" in item && Boolean(item.disabled)]];
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("disables the moving folder, its subfolders and its current parent", async () => {
  const query = vi.fn(async (name: string) =>
    name === "folders.list"
      ? [row("Work", null), row("Shots", "Work"), row("Raw", "Shots")]
      : [],
  );
  vi.stubGlobal("pond", { query });
  await folders.refresh();

  const items = buildMoveFolderItems(["Shots"]);
  expect(flatten(items)).toEqual([
    ["Top Level", false],
    ["Work", true],
    ["Shots", true],
    ["Raw", true],
  ]);

  const top = items[0];
  if (!top || !("onClick" in top)) {
    throw new Error("Missing Top Level");
  }
  top.onClick?.();
  await vi.waitFor(() =>
    expect(query).toHaveBeenCalledWith("folders.moveBatch", {
      ids: ["Shots"],
      parentId: null,
    }),
  );
});
