import { describe, expect, it, vi } from "vitest";
import {
  menuLabels as labels,
  menuLabelsWithoutIcons,
} from "@/shared/test/menu-labels";
import { buildFolderMenuItems, type FolderMenuActions } from ".";

function actions(
  overrides: Partial<FolderMenuActions> = {},
): FolderMenuActions {
  return {
    hasChildren: true,
    sameLevelHasChildren: true,
    includeSubfolders: true,
    creating: false,
    onNewFolder: vi.fn(),
    onNewSubfolder: vi.fn(),
    moveItems: [{ label: "Inbox", icon: <span />, onClick: vi.fn() }],
    onRename: vi.fn(),
    onBatchRename: vi.fn(),
    onAutoTag: vi.fn(),
    onToggleFolder: vi.fn(),
    onToggleSameLevel: vi.fn(),
    onToggleAll: vi.fn(),
    onDuplicate: vi.fn(),
    onExportFiles: vi.fn(),
    onExportCsv: vi.fn(),
    onExportEaglePackage: vi.fn(),
    onExportPackage: vi.fn(),
    onCopyToLibrary: vi.fn(),
    onCreateCanvas: vi.fn(),
    canvasItems: [{ label: "Moodboard", icon: <span />, onClick: vi.fn() }],
    onToggleSubfolders: vi.fn(),
    onCustomize: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe("folder context menu", () => {
  it("gives every searchable action an icon", () => {
    expect(menuLabelsWithoutIcons(buildFolderMenuItems(actions()))).toEqual([]);
  });

  it("matches Eagle folder operations Pond supports", () => {
    const menuLabels = labels(buildFolderMenuItems(actions()));

    expect(menuLabels).toEqual([
      "New Folder",
      "New Subfolder",
      "Move To",
      "Inbox",
      "Rename",
      "Batch Rename Folders",
      "Set Auto-Tag",
      "Expand/Collapse Folder",
      "Expand/Collapse Same Level Folders",
      "Expand/Collapse All Folders",
      "Duplicate",
      "Create Canvas from Folder",
      "Add Folder Saves to Canvas",
      "Moodboard",
      "Export",
      "Export Files",
      "Export to CSV",
      "Export Eagle Package",
      "Export Pond Package",
      "Add to Other Library",
      "Copy Folder Link",
      "Show Subfolder Content",
      "Customize Folder",
      "Remove Folder",
    ]);
    expect(menuLabels).not.toContain("Password");
    expect(menuLabels).not.toContain("Copy Link");
    expect(menuLabels).not.toContain("Add to Quick Access");
    expect(menuLabels.join(" ")).not.toContain("Plugin");
    expect(menuLabels.join(" ")).not.toContain("ArtStation");
    expect(menuLabels.join(" ")).not.toContain("Huaban");
    expect(menuLabels.join(" ")).not.toContain("Sketch");
  });

  it("disables expand actions when the folder has no children", () => {
    const items = buildFolderMenuItems(
      actions({ hasChildren: false, sameLevelHasChildren: false }),
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Expand/Collapse Folder",
          disabled: true,
        }),
        expect.objectContaining({
          label: "Expand/Collapse Same Level Folders",
          disabled: true,
        }),
      ]),
    );
  });

  it("marks show subfolder content from the folder setting", () => {
    const hidden = buildFolderMenuItems(actions({ includeSubfolders: false }));
    const shown = buildFolderMenuItems(actions({ includeSubfolders: true }));
    expect(hidden).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Show Subfolder Content",
          indicator: "check",
          checked: false,
        }),
      ]),
    );
    expect(shown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Show Subfolder Content",
          indicator: "check",
          checked: true,
        }),
      ]),
    );
  });

  it("opens folder customization", () => {
    const onCustomize = vi.fn();
    const item = buildFolderMenuItems(actions({ onCustomize })).find(
      (candidate) =>
        "label" in candidate && candidate.label === "Customize Folder",
    );
    if (!item || !("onClick" in item))
      throw new Error("Missing customize action");
    item.onClick?.();
    expect(onCustomize).toHaveBeenCalledOnce();
  });

  it("creates a canvas from the folder", () => {
    const onCreateCanvas = vi.fn();
    const item = buildFolderMenuItems(actions({ onCreateCanvas })).find(
      (candidate) =>
        "label" in candidate && candidate.label === "Create Canvas from Folder",
    );
    if (!item || !("onClick" in item))
      throw new Error("Missing create canvas action");
    item.onClick?.();
    expect(onCreateCanvas).toHaveBeenCalledOnce();
  });

  it("disables adding to a canvas until one exists", () => {
    expect(buildFolderMenuItems(actions({ canvasItems: [] }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "submenu",
          label: "Add Folder Saves to Canvas",
          disabled: true,
        }),
      ]),
    );
  });

  it("marks remove folder as destructive", () => {
    expect(buildFolderMenuItems(actions())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Remove Folder",
          variant: "destructive",
        }),
      ]),
    );
  });
});
