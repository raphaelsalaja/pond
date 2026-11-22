import { PrefsSchema } from "@pond/schema/db";
import type { FolderTemplate } from "@pond/schema/folder-templates";
import type { Transaction } from "@pond/schema/tx";
import { describe, expect, it } from "vitest";
import {
  applyFolderTemplate,
  type FolderTemplateRuntime,
} from "./folder-templates";
import type { UndoEffects } from "./undo";

const custom: FolderTemplate = {
  id: "custom:mine",
  name: "Mine",
  nodes: [
    {
      key: "root",
      parentKey: null,
      name: "Mine",
      automaticTags: ["work"],
      view: { layout: "list" },
    },
    { key: "child", parentKey: "root", name: "Drafts" },
  ],
};

function runtime(options: { failPrefs?: boolean } = {}) {
  let prefs = PrefsSchema.parse({ folderTemplates: { custom: [custom] } });
  const executed: Transaction[][] = [];
  const recorded: Array<{ txs: Transaction[]; effects?: UndoEffects }> = [];
  const removed: string[][] = [];
  let next = 0;
  const value: FolderTemplateRuntime = {
    run: (operation) => operation(),
    listFolders: async () => [],
    getPrefs: async () => prefs,
    setPrefs: async (patch) => {
      if (options.failPrefs) throw new Error("Prefs unavailable");
      prefs = PrefsSchema.parse({
        ...prefs,
        ...patch,
        folderViews: { ...prefs.folderViews, ...patch.folderViews },
        folderRules: { ...prefs.folderRules, ...patch.folderRules },
      });
    },
    removeFolderPrefs: async (ids) => {
      removed.push([...ids]);
    },
    execute: async (txs) => {
      executed.push(txs);
    },
    recordUndo: (txs, effects) => {
      recorded.push({ txs, effects });
      return "undo-1";
    },
    createId: () => `id-${next++}`,
  };
  return {
    value,
    executed,
    recorded,
    removed,
    prefs: () => prefs,
  };
}

describe("applyFolderTemplate", () => {
  it("writes settings and undoes them with the folders", async () => {
    const fake = runtime();
    const result = await applyFolderTemplate(
      { templateId: custom.id, parentId: null },
      fake.value,
    );
    expect(result).toEqual({ rootId: "id-0", count: 2, undoId: "undo-1" });
    expect(fake.prefs().folderRules["id-0"]?.automaticTags).toEqual(["work"]);
    expect(fake.prefs().folderViews["id-0"]?.layout).toBe("list");
    const step = fake.recorded[0];
    expect(step?.txs.map((tx) => tx.id)).toEqual(["id-0", "id-1"]);
    await step?.effects?.undo();
    expect(fake.removed).toEqual([["id-0", "id-1"]]);
  });

  it("removes the created folders when the settings write fails", async () => {
    const fake = runtime({ failPrefs: true });
    await expect(
      applyFolderTemplate({ templateId: custom.id }, fake.value),
    ).rejects.toThrow("Prefs unavailable");
    expect(fake.executed).toHaveLength(2);
    expect(fake.executed[1]?.map((tx) => [tx.kind, tx.id])).toEqual([
      ["delete", "id-1"],
      ["delete", "id-0"],
    ]);
    expect(fake.recorded).toEqual([]);
  });
});
