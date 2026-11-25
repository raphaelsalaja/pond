import type { MenuItemSpec } from "@pond/ui";
import type { QueryInput } from "@shared/query-contracts";
import { expect, it } from "vitest";
import { folders } from "@/features/library/state/folders";
import { bridge } from "@/shared/test/pond-bridge";
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
    if (item.type === "submenu") return flatten(item.items);
    if (!("label" in item)) return [];
    return [[String(item.label), "disabled" in item && Boolean(item.disabled)]];
  });
}

it("disables the moving folder, its subfolders and its current parent", async () => {
  const moved = Promise.withResolvers<QueryInput<"folders.moveBatch">>();
  bridge.use({
    query: {
      "folders.list": () => [
        row("Work", null),
        row("Shots", "Work"),
        row("Raw", "Shots"),
      ],
      "folders.memberships": () => [],
      "folders.moveBatch": (input) => {
        moved.resolve(input);
        return { ok: true, undoId: null };
      },
    },
  });
  await folders.refresh();

  const items = buildMoveFolderItems(["Shots"]);
  expect(flatten(items)).toEqual([
    ["Top Level", false],
    ["Work", true],
    ["Shots", true],
    ["Raw", true],
  ]);

  const top = items[0];
  if (!top || !("onClick" in top)) throw new Error("Missing Top Level");
  top.onClick?.();
  await expect(moved.promise).resolves.toEqual({
    ids: ["Shots"],
    parentId: null,
  });
});
