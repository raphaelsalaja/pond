import type { Transaction } from "@pond/schema/tx";
import { expect, it } from "vitest";
import { restoreSaveIntoFolders } from "./folders";
import type { RestoreSaveIntoFoldersRuntime } from "./folders";

function fixture(
  planAssignments: RestoreSaveIntoFoldersRuntime["planAssignments"],
) {
  const executed: Array<Array<Transaction>> = [];
  const recorded: Array<Array<Transaction>> = [];
  const runtime: RestoreSaveIntoFoldersRuntime = {
    run: (operation) => operation(),
    planAssignments,
    execute: async (transactions) => {
      executed.push(transactions);
      return [];
    },
    recordUndo: (transactions) => {
      recorded.push(transactions);
      return "undo-1";
    },
  };
  return { executed, recorded, runtime };
}

it("restores and files a trashed Save in one batch and one Undo step", async () => {
  const { executed, recorded, runtime } = fixture(async (_, restoring) => {
    expect([...restoring]).toEqual(["save-a"]);
    return [
      {
        kind: "update",
        model: "save_folder",
        id: "save-a",
        patch: { folderIds: ["folder-a"] },
        before: { folderIds: [] },
      },
    ];
  });

  await restoreSaveIntoFolders("save-a", ["folder-a"], "test", runtime);

  expect(executed).toEqual([
    [
      expect.objectContaining({ kind: "untrash", model: "save", id: "save-a" }),
      expect.objectContaining({
        model: "save_folder",
        patch: { folderIds: ["folder-a"] },
      }),
    ],
  ]);
  expect(recorded).toEqual(executed);
});

it("leaves the Save in Trash when filing it can't be planned", async () => {
  const { executed, recorded, runtime } = fixture(async () => {
    throw new Error("Destination folder no longer exists.");
  });

  await expect(
    restoreSaveIntoFolders("save-a", ["missing"], "test", runtime),
  ).rejects.toThrow("Destination folder no longer exists.");
  expect(executed).toEqual([]);
  expect(recorded).toEqual([]);
});
