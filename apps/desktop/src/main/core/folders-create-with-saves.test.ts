import type { Folder } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { expect, it } from "vitest";
import {
  type CreateFolderWithSavesRuntime,
  createFolderWithSaves,
} from "./folders";

it("creates a folder and assigns Saves in one Undo batch", async () => {
  const executed: Transaction[][] = [];
  const recorded: Transaction[][] = [];
  const createdAt = new Date("2026-09-24T00:00:00.000Z");
  const existing: Folder = {
    id: "existing",
    name: "Existing",
    parentId: null,
    color: null,
    sortOrder: 0,
    createdAt,
  };
  const runtime: CreateFolderWithSavesRuntime = {
    run: (operation) => operation(),
    listFolders: async () => [existing],
    folderIdsForSave: async (saveId) =>
      saveId === "save-a" ? [existing.id] : [],
    planAssignments: async (assignments, folders) => {
      expect(folders.map((folder) => folder.id)).toEqual([
        "existing",
        "new-folder",
      ]);
      return assignments.map(
        ({ saveId, folderIds }): Transaction => ({
          kind: "update",
          model: "save_folder",
          id: saveId,
          patch: { folderIds },
          before: { folderIds: saveId === "save-a" ? ["existing"] : [] },
        }),
      );
    },
    execute: async (transactions) => {
      executed.push(transactions);
      return [];
    },
    recordUndo: (transactions) => {
      recorded.push(transactions);
      return "undo-1";
    },
    createId: () => "new-folder",
    now: () => createdAt,
  };

  const folder = await createFolderWithSaves(
    { name: "Research", parentId: null, saveIds: ["save-a", "save-b"] },
    runtime,
  );

  expect(folder).toEqual({
    id: "new-folder",
    name: "Research",
    parentId: null,
    color: null,
    sortOrder: 1,
    createdAt,
    undoId: "undo-1",
  });
  expect(executed).toHaveLength(1);
  expect(executed[0]).toEqual([
    expect.objectContaining({
      kind: "create",
      model: "folder",
      id: "new-folder",
    }),
    expect.objectContaining({
      model: "save_folder",
      id: "save-a",
      patch: { folderIds: ["existing", "new-folder"] },
    }),
    expect.objectContaining({
      model: "save_folder",
      id: "save-b",
      patch: { folderIds: ["new-folder"] },
    }),
  ]);
  expect(recorded).toEqual(executed);
});
