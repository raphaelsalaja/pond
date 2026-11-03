import { MANUAL_NOT_SENSITIVE_MODEL } from "@pond/schema/content-safety";
import type { MenuItemSpec } from "@pond/ui";
import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/app/effects/save-library-bridge";
import {
  closeConversionDialog,
  conversionDialogStore,
} from "@/features/library/state/conversion-dialog";
import { folders } from "@/features/library/state/folders";
import { buildViewerMenu } from "@/features/saves/components/viewers/media-viewer/lib/menu";
import { pool } from "@/features/saves/state/pool";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import {
  menuLabelsWithoutIcons,
  topLevelMenuLabels as topLevelLabels,
  menuLabels as visibleLabels,
} from "@/shared/test/menu-labels";
import {
  buildSaveDetailMenu,
  buildSaveExportPopup,
  buildSaveMenu,
  contextMenuSaves,
  type OpenWithApp,
  openWithKind,
} from "./menu";

function sectionItems(
  items: MenuItemSpec[],
  label: string,
): MenuItemSpec[] | null {
  for (const item of items) {
    if (
      (item.type === "submenu" || item.type === "group") &&
      item.label === label &&
      !item.hidden
    ) {
      return item.items;
    }
  }
  return null;
}

function checkboxLabeled(items: MenuItemSpec[], label: string) {
  for (const item of items) {
    if (item.type === "checkbox" && item.label === label) return item;
  }
  throw new Error(`Missing ${label}`);
}

function containsSubmenu(items: MenuItemSpec[]): boolean {
  return items.some((item) => {
    if (item.type === "submenu") return true;
    return item.type === "group" ? containsSubmenu(item.items) : false;
  });
}

function visibleLeafItems(items: MenuItemSpec[]): MenuItemSpec[] {
  return items.flatMap((item) => {
    if ("hidden" in item && item.hidden) return [];
    if (item.type === "group") return visibleLeafItems(item.items);
    if (
      item.type === "separator" ||
      item.type === "custom" ||
      item.type === "submenu"
    )
      return [];
    return [item];
  });
}

function fileSave(overrides: Partial<Save> = {}): Save {
  return {
    id: "file-save",
    source: "twitter",
    sourceId: "file-save",
    url: "https://example.test/file",
    title: "File",
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "file",
    files: [
      {
        kind: "file",
        path: "reference.psd",
        mimeType: "image/vnd.adobe.photoshop",
        sha256: "abc",
        size: 1,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  selection.clear();
  pool.clear();
  closeConversionDialog();
  vi.stubGlobal("pond", {
    query: async () => [],
  });
  await folders.refresh();
});

function previewOpenWithApps(): OpenWithApp[] {
  return [
    {
      name: "Preview.app",
      path: "/System/Applications/Preview.app",
      icon: "data:image/png;base64,aaa",
      isDefault: true,
    },
    {
      name: "Photomator.app",
      path: "/Applications/Photomator.app",
      icon: null,
      isDefault: false,
    },
  ];
}

describe("buildSaveMenu", () => {
  it("keeps the detail menu focused on file actions", () => {
    const items = buildSaveDetailMenu(fileSave(), {
      clipboardEmpty: true,
      openWithApps: previewOpenWithApps(),
      opened: true,
    });

    expect(topLevelLabels(items)).toEqual([
      "Open in New Window",
      "Open With",
      REVEAL_LABEL,
      "Replace File",
      "Export",
      "Share",
      "Copy",
      "Move to Trash",
    ]);
    const exportItem = items.find(
      (item) => "label" in item && item.label === "Export",
    );
    if (!exportItem || !("onClick" in exportItem))
      throw new Error("Missing Export action");
    exportItem.onClick?.();
    expect(conversionDialogStore.state?.mode).toBe("files");
    expect(topLevelLabels(sectionItems(items, "Open With") ?? [])).toEqual([
      "Default App",
      "Photomator.app",
    ]);
    const detailCopyItems = sectionItems(items, "Copy") ?? [];
    expect(topLevelLabels(detailCopyItems)).toEqual([
      "Copy Name",
      "Copy",
      "Copy File Path",
    ]);
    expect(visibleLabels(detailCopyItems)).toEqual([
      "Copy Name",
      "Copy",
      "Copy File Path",
      "Copy as Base64",
      "Copy Pond Link",
      "Copy URL",
    ]);
    const copyIcons = visibleLeafItems(detailCopyItems).map((item) =>
      "icon" in item && isValidElement(item.icon) ? item.icon.type : null,
    );
    expect(copyIcons).not.toContain(null);
    expect(new Set(copyIcons).size).toBe(copyIcons.length);
    expect(
      items
        .filter((item) => item.type === "submenu")
        .every((item) => !containsSubmenu(item.items)),
    ).toBe(true);
    expect(visibleLabels(items)).not.toEqual(
      expect.arrayContaining([
        "Add Tags",
        "Add to Folders",
        "Add to Other Library",
        "Rename",
        "Paste Tags",
        "Find Duplicates",
        "Merge Duplicates",
        "Copy Save ID",
        "Thumbnail",
        "Re-analyze Colors",
        "Navigator",
      ]),
    );
  });

  it("corrects a sensitive result from the save menu and can mark it again", async () => {
    const query = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("pond", { query });
    const save = fileSave({
      mediaType: "image",
      sensitiveScore: 0.99,
      sensitiveModel: "model@revision",
      files: [
        {
          kind: "image",
          path: "image.jpg",
          mimeType: "image/jpeg",
          sha256: "abc",
          size: 1,
        },
      ],
    });
    pool.upsert(save);
    const items = buildSaveMenu(save, { clipboardEmpty: true });
    const action = checkboxLabeled(items, "Sensitive Content");
    expect(action.checked).toBe(true);
    expect(
      visibleLabels(buildSaveDetailMenu(save, { clipboardEmpty: true })),
    ).toContain("Sensitive Content");
    action.onCheckedChange?.(false);
    expect(pool.get(save.id)?.sensitiveScore).toBe(0);
    expect(pool.get(save.id)?.sensitiveModel).toBe(MANUAL_NOT_SENSITIVE_MODEL);
    expect(query).toHaveBeenCalledWith("saves.patchDerived", {
      id: save.id,
      patch: {
        sensitiveScore: 0,
        sensitiveModel: MANUAL_NOT_SENSITIVE_MODEL,
      },
    });

    const corrected = pool.get(save.id);
    if (!corrected) throw new Error("Missing corrected Save");
    const again = buildSaveMenu(corrected, { clipboardEmpty: true });
    const restore = checkboxLabeled(again, "Sensitive Content");
    expect(restore.checked).toBe(false);
    restore.onCheckedChange?.(true);
    expect(pool.get(save.id)?.sensitiveScore).toBe(1);
    expect(
      visibleLabels(
        buildSaveMenu({ ...corrected, deletedAt: 5 }, { clipboardEmpty: true }),
      ),
    ).not.toContain("Sensitive Content");
    expect(
      visibleLabels(buildSaveMenu(fileSave(), { clipboardEmpty: true })),
    ).not.toContain("Sensitive Content");
  });

  it("offers to create a folder from the current selection", () => {
    const items = buildSaveMenu(
      [fileSave({ id: "one" }), fileSave({ id: "two" })],
      { clipboardEmpty: true },
    );

    expect(visibleLabels(items)).toContain("New Folder with 2 Saves");
  });

  it("offers detached references for video originals but not batch selections or documents", () => {
    const video = fileSave({
      files: [
        {
          kind: "video",
          path: "clip.mp4",
          mimeType: "video/mp4",
          sha256: "video",
          size: 42,
        },
      ],
    });
    expect(
      visibleLabels(buildSaveMenu(video, { clipboardEmpty: true })),
    ).toContain("Open in New Window");
    expect(
      visibleLabels(
        buildSaveMenu([video, { ...video, id: "second" }], {
          clipboardEmpty: true,
        }),
      ),
    ).not.toContain("Open in New Window");
    const document = fileSave({
      files: [
        {
          kind: "file",
          path: "document.pdf",
          mimeType: "application/pdf",
          sha256: "pdf",
          size: 12,
        },
      ],
    });
    expect(
      visibleLabels(buildSaveMenu(document, { clipboardEmpty: true })),
    ).not.toContain("Open in New Window");
  });

  it("builds the dedicated export popup", () => {
    expect(
      visibleLabels(
        buildSaveExportPopup(fileSave(), {
          clipboardEmpty: true,
          fileIndex: 0,
          opened: true,
        }),
      ),
    ).toEqual([
      "Export Files",
      "Export Converted Files",
      "Export Eagle Package",
      "Export to CSV",
    ]);
  });

  it("offers lossless and quality compression for supported images", () => {
    const save = fileSave({
      mediaType: "image",
      files: [
        {
          kind: "image",
          path: "image.png",
          mimeType: "image/png",
          sha256: "png",
          size: 100,
        },
      ],
    });
    const items = buildSaveMenu(save, { clipboardEmpty: true });
    const exports = sectionItems(items, "Export") ?? [];
    const compression = sectionItems(exports, "Compress Images");
    expect(topLevelLabels(exports)).toContain("Compress Images");
    expect(topLevelLabels(compression ?? [])).toEqual([
      "Convert to WebP",
      "Lossless",
      "Quality 85",
    ]);
  });

  it("keeps common actions flat and reserves submenus for option families", () => {
    const items = buildSaveMenu(fileSave(), {
      clipboardEmpty: true,
      openWithApps: previewOpenWithApps(),
    });

    expect(topLevelLabels(items)).toEqual([
      "Open Save",
      "Open in New Window",
      "Open with Default App",
      "Open With",
      REVEAL_LABEL,
      "Open Original in Browser",
      "Replace File",
      "Add Tags",
      "Add to Folders",
      "Add to Canvas",
      "Add to Other Library",
      "Export",
      "Share",
      "Paste Tags",
      "Find Duplicates",
      "Merge Duplicates",
      "Copy Name",
      "Copy",
      "Copy File Path",
      "Copy Options",
      "Copy Save ID",
      "Thumbnail",
      "Refresh from Source",
      "Search by Image",
      "Fish",
      "More",
      "Move to Trash",
    ]);
    expect(visibleLabels(sectionItems(items, "Fish") ?? [])).toEqual([
      "Add to Chat",
      "Apply Suggested Tags",
      "Caption Images",
      "Extract Text",
      "Transcribe Media",
      "Check Sensitive Content",
    ]);
    expect(topLevelLabels(sectionItems(items, "Open With") ?? [])).toEqual([
      "Preview.app (Default)",
      "Photomator.app",
    ]);
    const reverseSearchItems = sectionItems(items, "Search by Image") ?? [];
    expect(visibleLabels(reverseSearchItems)).toEqual([
      "Google Lens",
      "Yandex",
      "Bing",
      "TinEye",
      "SauceNAO",
      "Baidu",
      "Sogou",
    ]);
    const visibleReverseSearchItems = reverseSearchItems.filter(
      (item) => !("hidden" in item) || !item.hidden,
    );
    expect(
      visibleReverseSearchItems.every(
        (item) => "icon" in item && isValidElement(item.icon),
      ),
    ).toBe(true);
    expect(
      visibleReverseSearchItems
        .slice(0, 5)
        .every(
          (item) =>
            "icon" in item &&
            isValidElement(item.icon) &&
            item.icon.type === "img",
        ),
    ).toBe(true);
    expect(visibleLabels(sectionItems(items, "Export") ?? [])).toEqual([
      "Export Files",
      "Export Converted Files",
      "Export as WebP",
      "Export Eagle Package",
      "Export Pond Package",
      "Export to CSV",
    ]);
    expect(visibleLabels(sectionItems(items, "More") ?? [])).toEqual([
      "Rebuild Search Index",
      "Rebuild Visual Index",
      "Change Extension",
    ]);
    expect(visibleLabels(sectionItems(items, "Thumbnail") ?? [])).toEqual([
      "Set Thumbnail from File",
      "Set Thumbnail from Clipboard",
      "Reset Thumbnail",
      "Thumbnail Background",
      "None",
      "Black",
      "Gray",
      "White",
      "Grid",
    ]);
  });

  it("does not use ellipses in action labels", () => {
    const labels = visibleLabels(
      buildSaveMenu(fileSave(), {
        clipboardEmpty: true,
        openWithApps: previewOpenWithApps(),
      }),
    );

    expect(labels.filter((label) => label.includes("…"))).toEqual([]);
  });

  it("keeps opening actions available before apps are listed", () => {
    const items = buildSaveMenu(fileSave(), {
      clipboardEmpty: true,
      openWithApps: [],
    });
    expect(topLevelLabels(items)).toContain("Open with Default App");
    expect(visibleLabels(items)).not.toContain("Open With");
  });

  it("keys Open With kind from mime type then extension", () => {
    expect(openWithKind(fileSave())).toBe("image/vnd.adobe.photoshop");
    expect(
      openWithKind(
        fileSave({
          files: [
            {
              kind: "file",
              path: "shot.PNG",
              mimeType: null,
              sha256: "abc",
              size: 1,
            },
          ],
        }),
      ),
    ).toBe(".png");
  });

  it("lists apps in Open With with the default marked", () => {
    const items = buildSaveMenu(fileSave(), {
      clipboardEmpty: true,
      openWithApps: previewOpenWithApps(),
    });
    expect(topLevelLabels(sectionItems(items, "Open With") ?? [])).toEqual([
      "Preview.app (Default)",
      "Photomator.app",
    ]);
    const preview = sectionItems(items, "Open With")?.find(
      (item) => "label" in item && item.label === "Preview.app (Default)",
    );
    expect(preview && "icon" in preview ? preview.icon : null).toBeTruthy();
  });

  it("builds the nested save menu for a video", () => {
    const save = fileSave({
      id: "video-save",
      sourceId: "video-save",
      url: "https://example.test/video",
      title: null,
      mediaType: "video",
      files: [
        {
          kind: "video",
          path: "clip.mp4",
          mimeType: "video/mp4",
          sha256: "abc",
          size: 1,
        },
      ],
    });

    expect(
      visibleLabels(buildSaveMenu(save, { clipboardEmpty: true })),
    ).toEqual(
      expect.arrayContaining(["Copy Video", "Copy File Path", "Copy URL"]),
    );
  });

  it("offers Download Video for a video save without a video file", () => {
    const save = fileSave({
      id: "poster-only",
      sourceId: "poster-only",
      mediaType: "video",
      files: [
        {
          kind: "poster",
          path: "poster.jpg",
          mimeType: "image/jpeg",
          sha256: "abc",
          size: 1,
        },
      ],
    });
    const labels = visibleLabels(buildSaveMenu(save, { clipboardEmpty: true }));
    expect(labels).toContain("Download Video");
    expect(labels).not.toContain("Remove Video");
  });

  it("offers Remove Video when the video file is present", () => {
    const save = fileSave({
      id: "downloaded",
      sourceId: "downloaded",
      mediaType: "video",
      files: [
        {
          kind: "video",
          path: "clip.mp4",
          mimeType: "video/mp4",
          sha256: "abc",
          size: 1,
        },
      ],
    });
    const labels = visibleLabels(buildSaveMenu(save, { clipboardEmpty: true }));
    expect(labels).toContain("Remove Video");
    expect(labels).not.toContain("Download Video");
  });

  it("offers Download Video for a batch of poster-only video saves", () => {
    const posterOnly = (id: string) =>
      fileSave({
        id,
        sourceId: id,
        mediaType: "video",
        files: [
          {
            kind: "poster",
            path: "poster.jpg",
            mimeType: "image/jpeg",
            sha256: id,
            size: 1,
          },
        ],
      });
    const labels = visibleLabels(
      buildSaveMenu([posterOnly("first"), posterOnly("second")], {
        clipboardEmpty: true,
      }),
    );
    expect(labels).toContain("Download Video");
    expect(labels).not.toContain("Remove Video");
  });

  it("marks trash actions as destructive", () => {
    const liveItems = buildSaveMenu(fileSave(), { clipboardEmpty: true });
    expect(
      liveItems.find(
        (item) => "label" in item && item.label === "Move to Trash",
      ),
    ).toMatchObject({ variant: "destructive" });

    const trashedItems = buildSaveMenu(fileSave({ deletedAt: 1 }), {
      clipboardEmpty: true,
    });
    expect(
      trashedItems.find(
        (item) => "label" in item && item.label === "Delete Forever",
      ),
    ).toMatchObject({ variant: "destructive" });
  });

  it("offers Reset Thumbnail for any save with an original, thumbnail or not", () => {
    const save = fileSave({
      source: "local",
      url: "pond:local/file-save",
      files: [{ kind: "file", path: "asset.zip", sha256: "a", size: 1 }],
    });
    const items = buildSaveMenu(save, { clipboardEmpty: true });
    expect(visibleLabels(items)).toContain("Reset Thumbnail");
    expect(
      sectionItems(items, "Thumbnail")?.find(
        (item) => "label" in item && item.label === "Reset Thumbnail",
      ),
    ).toMatchObject({ variant: "destructive" });
  });

  it("does not expose a card-only thumbnail as an original file", () => {
    const save = fileSave({
      id: "thumbnail-only",
      source: "local",
      sourceId: "thumbnail-only",
      url: "pond:local/thumbnail-only",
      title: "Thumbnail",
      mediaType: "link",
      files: [
        {
          kind: "thumbnail",
          path: "thumb.png",
          mimeType: "image/png",
          sha256: "b",
          size: 1,
        },
      ],
    });
    const labels = visibleLabels(buildSaveMenu(save, { clipboardEmpty: true }));
    expect(labels).not.toContain("Open with Default App");
    expect(labels).not.toContain("Export Files");
    expect(labels).toContain("Export to CSV");
    expect(labels).not.toContain("Reset Thumbnail");
    expect(labels).toContain("Rename");
  });

  it("hides Open Save when the save is already open", () => {
    const labels = visibleLabels(
      buildSaveMenu(fileSave(), { clipboardEmpty: true, opened: true }),
    );
    expect(labels).not.toContain("Open Save");
    expect(labels).not.toContain("Pin Preview");
  });

  it("hides Open Save when several saves are selected", () => {
    const labels = visibleLabels(
      buildSaveMenu([fileSave(), fileSave({ id: "other" })], {
        clipboardEmpty: true,
      }),
    );
    expect(labels).not.toContain("Open Save");
    expect(labels).toContain("Open with Default App");
  });

  it("lists the folder tree under Add to Folders and checks folders the save is in", async () => {
    const row = (id: string, parentId: string | null) => ({
      id,
      name: id,
      parentId,
      color: null,
      sortOrder: 0,
      createdAt: new Date(),
    });
    vi.stubGlobal("pond", {
      query: async (name: string) => {
        if (name === "folders.list")
          return [row("Refs", null), row("Shots", "Refs"), row("Inbox", null)];
        if (name === "folders.memberships")
          return [{ saveId: "file-save", folderId: "Refs" }];
        return [];
      },
    });
    await folders.refresh();
    const items =
      sectionItems(
        buildSaveMenu(fileSave(), { clipboardEmpty: true }),
        "Add to Folders",
      ) ?? [];
    expect(visibleLabels(items)).toEqual([
      "Inbox",
      "Refs",
      "Refs",
      "Shots",
      "New Folder",
    ]);
    const refs = sectionItems(items, "Refs") ?? [];
    expect(refs[0]).toMatchObject({ type: "checkbox", checked: true });
    expect(refs[2]).toMatchObject({ label: "Shots", checked: false });
  });

  it("hides Fish for trashed saves", () => {
    expect(
      topLevelLabels(
        buildSaveMenu(fileSave({ deletedAt: 1 }), { clipboardEmpty: true }),
      ),
    ).not.toContain("Fish");
  });

  it("shows Rename only for a local save", () => {
    expect(
      visibleLabels(buildSaveMenu(fileSave(), { clipboardEmpty: true })),
    ).not.toContain("Rename");
    expect(
      visibleLabels(
        buildSaveMenu(fileSave({ source: "local" }), { clipboardEmpty: true }),
      ),
    ).toContain("Rename");
  });

  it("puts All ahead of folder names under Navigate to Folder", async () => {
    vi.stubGlobal("pond", {
      query: async (name: string) => {
        if (name === "folders.list")
          return [
            {
              id: "refs",
              name: "Refs",
              parentId: null,
              color: null,
              sortOrder: 0,
              createdAt: new Date(),
            },
          ];
        if (name === "folders.memberships")
          return [{ saveId: "file-save", folderId: "refs" }];
        return [];
      },
    });
    await folders.refresh();
    expect(
      visibleLabels(
        sectionItems(
          buildSaveMenu(fileSave(), { clipboardEmpty: true }),
          "Navigate to Folder",
        ) ?? [],
      ),
    ).toEqual(["All", "Refs"]);
  });

  it("puts an icon on every visible top-level action", () => {
    const missing = topLevelLabels(
      buildSaveMenu(fileSave(), { clipboardEmpty: true }),
    ).filter((label) => {
      const item = buildSaveMenu(fileSave(), { clipboardEmpty: true }).find(
        (entry) => "label" in entry && entry.label === label,
      );
      return (
        item?.type !== "group" &&
        (!item || !("icon" in item) || item.icon == null)
      );
    });
    expect(missing).toEqual([]);
  });

  it("gives every visible searchable action an icon", () => {
    expect(
      menuLabelsWithoutIcons(
        buildSaveMenu(fileSave(), { clipboardEmpty: true }),
      ),
    ).toEqual([]);
  });
});

describe("contextMenuSaves", () => {
  it("uses the whole selection when the clicked save is already selected", () => {
    const first = fileSave({ id: "first" });
    const second = fileSave({ id: "second" });
    pool.bulkUpsert([first, second]);
    selection.set(["first", "second"]);
    expect(contextMenuSaves(first).map((save) => save.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("uses only the clicked save when it is not in the selection", () => {
    const first = fileSave({ id: "first" });
    const second = fileSave({ id: "second" });
    pool.bulkUpsert([first, second]);
    selection.set(["second"]);
    expect(contextMenuSaves(first).map((save) => save.id)).toEqual(["first"]);
  });
});

describe("buildViewerMenu", () => {
  it("hides Open Save because the save is already open", () => {
    const labels = visibleLabels(
      buildViewerMenu(fileSave(), {
        clipboardEmpty: true,
        video: null,
        fileIndex: 0,
      }),
    );
    expect(labels).not.toContain("Open Save");
    expect(labels[0]).toBe("Open in New Window");
    expect(labels).not.toContain("Pin Preview");
  });

  it("replaces Copy Image when a video frame is available", () => {
    const save = fileSave({
      mediaType: "image",
      files: [
        {
          kind: "image",
          path: "still.png",
          mimeType: "image/png",
          sha256: "abc",
          size: 1,
        },
      ],
    });
    const video = document.createElement("video");
    Object.defineProperty(video, "videoWidth", { value: 1920 });
    const labels = visibleLabels(
      buildViewerMenu(save, { clipboardEmpty: true, video, fileIndex: 0 }),
    );
    expect(labels).toContain("Set Current Frame as Thumbnail");
    expect(labels).toContain("Copy Current Frame");
    expect(labels).not.toContain("Copy Image");
    expect(labels).not.toContain("Open Save");
    expect(labels).toContain("Copy Options");
  });

  it("converts the WebP file selected in the viewer", () => {
    const query = vi.fn(async () => ({ id: "job" }));
    vi.stubGlobal("pond", { query });
    const save = fileSave({
      mediaType: "image",
      files: [
        {
          kind: "image",
          path: "cover.png",
          mimeType: "image/png",
          sha256: "png",
          size: 1,
        },
        {
          kind: "image",
          path: "alternate.webp",
          mimeType: "image/webp",
          sha256: "webp",
          size: 1,
        },
      ],
    });
    const exports =
      sectionItems(
        buildViewerMenu(save, {
          clipboardEmpty: true,
          video: null,
          fileIndex: 1,
        }),
        "Export",
      ) ?? [];
    for (const label of ["Convert to PNG", "Convert to JPG"]) {
      const action = exports.find(
        (item) => "label" in item && item.label === label,
      );
      if (!action || !("onClick" in action))
        throw new Error(`Missing ${label}`);
      action.onClick?.();
    }
    expect(query).toHaveBeenNthCalledWith(
      1,
      "conversion.start",
      expect.objectContaining({
        fileIndex: 1,
        preset: expect.objectContaining({ format: "png" }),
      }),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "conversion.start",
      expect.objectContaining({
        fileIndex: 1,
        preset: expect.objectContaining({ format: "jpeg" }),
      }),
    );
  });
});
