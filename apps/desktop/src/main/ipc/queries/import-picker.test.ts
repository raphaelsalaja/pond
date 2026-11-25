import type { OpenDialogOptions } from "electron";
import { describe, expect, it } from "vitest";
import { createImportPicker, ImportKindSchema } from "./import-picker";

function fixture(focused: { id: number } | null = null, canceled = false) {
  const opened: Array<{
    window: { id: number } | null;
    options: OpenDialogOptions;
  }> = [];
  const pick = createImportPicker({
    focusedWindow: () => focused,
    async open(window, options) {
      opened.push({ window, options });
      return { canceled, filePaths: ["/tmp/photo.png"] };
    },
  });
  return { pick, opened };
}

describe("native import picker", () => {
  it("picks multiple files", async () => {
    const { pick, opened } = fixture();
    expect(await pick("files")).toEqual({ paths: ["/tmp/photo.png"] });
    expect(opened).toEqual([
      {
        window: null,
        options: {
          title: "Import Files",
          buttonLabel: "Import",
          properties: ["openFile", "multiSelections"],
        },
      },
    ]);
  });
  it("picks multiple folders attached to the focused window", async () => {
    const { pick, opened } = fixture({ id: 1 });
    await pick("folders");
    expect(opened).toEqual([
      {
        window: { id: 1 },
        options: {
          title: "Import Folders",
          buttonLabel: "Import",
          properties: ["openDirectory", "multiSelections"],
        },
      },
    ]);
  });
  it("treats cancellation as no selection", async () => {
    expect(await fixture(null, true).pick("files")).toEqual({ paths: [] });
  });
  it("rejects unknown modes at the boundary", () => {
    expect(ImportKindSchema.safeParse("anything").success).toBe(false);
  });
});
