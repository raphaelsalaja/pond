import { FILE_RING_CAPACITY, type FileRingItem } from "@pond/schema/file-ring";
import { describe, expect, it } from "vitest";
import {
  autoRingItems,
  dragActions,
  dropOnRing,
  layoutRing,
  pickRingFolders,
  RING_FILL,
  type RingDropHandlers,
  ringOpens,
} from "./slots";

interface Row {
  id: string;
  name: string;
  sortOrder: number;
}

const rows: Row[] = [
  { id: "inbox", name: "Inbox", sortOrder: 0 },
  { id: "portraits", name: "Portraits", sortOrder: 1 },
  { id: "rooms", name: "Rooms", sortOrder: 2 },
  { id: "type", name: "Type", sortOrder: 3 },
  { id: "film", name: "Film", sortOrder: 4 },
  { id: "plants", name: "Plants", sortOrder: 5 },
];

function ids(folders: readonly Row[]): string[] {
  return folders.map((folder) => folder.id);
}

function recordingHandlers() {
  const calls: string[] = [];
  const handlers: RingDropHandlers<Row, string[]> = {
    addToFolder: (saveIds, folder) =>
      calls.push(`add ${saveIds.join(",")} to ${folder.id}`),
    createFolder: (saveIds) => calls.push(`create ${saveIds.join(",")}`),
    exportFiles: (saveIds) => calls.push(`export ${saveIds.join(",")}`),
  };
  return { calls, handlers };
}

describe("ring folders", () => {
  it("puts Quick Access first, in its order", () => {
    const quick = {
      rooms: { quickAccess: true, quickAccessOrder: 1 },
      portraits: { quickAccess: true, quickAccessOrder: 0 },
      film: { quickAccess: false, quickAccessOrder: 2 },
    };
    const picked = pickRingFolders(rows, quick, []);
    expect(ids(picked)).toEqual(["portraits", "rooms"]);
  });

  it("fills the rest from recent destinations without repeats", () => {
    const quick = { rooms: { quickAccess: true } };
    const recent = ["rooms", "deleted", "film", "film", "type", "plants"];
    const picked = pickRingFolders(rows, quick, recent);
    expect(ids(picked)).toEqual(["rooms", "film", "type", "plants"]);
  });

  it("stops at four folders", () => {
    const quick = {
      inbox: { quickAccess: true, quickAccessOrder: 0 },
      portraits: { quickAccess: true, quickAccessOrder: 1 },
      rooms: { quickAccess: true, quickAccessOrder: 2 },
      type: { quickAccess: true, quickAccessOrder: 3 },
      film: { quickAccess: true, quickAccessOrder: 4 },
    };
    const picked = pickRingFolders(rows, quick, ["plants"]);
    expect(ids(picked)).toEqual(["inbox", "portraits", "rooms", "type"]);
  });

  it("returns nothing without Quick Access or recent folders", () => {
    expect(pickRingFolders(rows, {}, [])).toEqual([]);
    expect(pickRingFolders(rows, {}, ["deleted"])).toEqual([]);
  });
});

function folderItems(folderIds: readonly string[]): FileRingItem[] {
  return folderIds.map((folderId) => ({ kind: "folder", folderId }));
}

describe("automatic ring", () => {
  it("puts New Folder and Export Files ahead of the picked folders", () => {
    const quick = { rooms: { quickAccess: true } };
    expect(autoRingItems(rows, quick, ["film"])).toEqual([
      { kind: "action", action: "new-folder" },
      { kind: "action", action: "export-files" },
      { kind: "folder", folderId: "rooms" },
      { kind: "folder", folderId: "film" },
    ]);
  });

  it("fills every sector of the ring and no more", () => {
    expect(RING_FILL).toHaveLength(FILE_RING_CAPACITY);
  });
});

describe("ring layout", () => {
  const auto = autoRingItems(rows, {}, ["inbox", "portraits", "rooms"]);

  it("fills the sides before the bottom and keeps the actions on top", () => {
    const layout = layoutRing(auto, rows, dragActions(true));
    expect(layout.left).toEqual({ kind: "folder", folder: rows[0] });
    expect(layout.right).toEqual({ kind: "folder", folder: rows[1] });
    expect(layout["bottom-left"]).toEqual({ kind: "folder", folder: rows[2] });
    expect(layout["bottom-right"]).toBeUndefined();
    expect(layout["top-left"]).toEqual({
      kind: "action",
      action: "new-folder",
      disabled: false,
    });
    expect(layout["top-right"]).toEqual({
      kind: "action",
      action: "export-files",
      disabled: false,
    });
  });

  it("turns off Export Files when no dragged Save has a file", () => {
    const layout = layoutRing(auto, rows, dragActions(false));
    expect(layout["top-right"]).toMatchObject({ disabled: true });
    expect(layout["top-left"]).toMatchObject({ disabled: false });
  });

  it("places a customized ring in its saved order", () => {
    const items: FileRingItem[] = [
      { kind: "folder", folderId: "film" },
      { kind: "action", action: "export-files" },
      { kind: "folder", folderId: "plants" },
    ];
    const layout = layoutRing(items, rows, dragActions(true));
    expect(layout["top-left"]).toEqual({ kind: "folder", folder: rows[4] });
    expect(layout["top-right"]).toMatchObject({ action: "export-files" });
    expect(layout.left).toEqual({ kind: "folder", folder: rows[5] });
    expect(layout.right).toBeUndefined();
  });

  it("leaves a deleted folder's sector empty and keeps the rest in place", () => {
    const items = folderItems(["inbox", "gone", "rooms"]);
    const layout = layoutRing(items, rows, dragActions(true));
    expect(layout["top-left"]).toEqual({ kind: "folder", folder: rows[0] });
    expect(layout["top-right"]).toBeUndefined();
    expect(layout.left).toEqual({ kind: "folder", folder: rows[2] });
  });

  it("shows a renamed folder under its new name", () => {
    const renamed = rows.map((row) =>
      row.id === "inbox" ? { ...row, name: "Unsorted" } : row,
    );
    const layout = layoutRing(
      folderItems(["inbox"]),
      renamed,
      dragActions(true),
    );
    expect(layout["top-left"]).toMatchObject({ folder: { name: "Unsorted" } });
  });
});

describe("ring opening", () => {
  it("keeps the automatic ring closed until there's a folder to file into", () => {
    const empty = layoutRing(autoRingItems([], {}, []), [], dragActions(true));
    expect(ringOpens(empty, false)).toBe(false);
    const one = layoutRing(
      autoRingItems(rows, {}, ["film"]),
      rows,
      dragActions(true),
    );
    expect(ringOpens(one, false)).toBe(true);
  });

  it("opens a customized ring for any sector that takes the drop", () => {
    const actions: FileRingItem[] = [{ kind: "action", action: "new-folder" }];
    expect(ringOpens(layoutRing(actions, [], dragActions(false)), true)).toBe(
      true,
    );
    const exportOnly: FileRingItem[] = [
      { kind: "action", action: "export-files" },
    ];
    expect(
      ringOpens(layoutRing(exportOnly, [], dragActions(false)), true),
    ).toBe(false);
    const gone = folderItems(["gone"]);
    expect(ringOpens(layoutRing(gone, rows, dragActions(true)), true)).toBe(
      false,
    );
  });

  it("dims click-only actions during a drag", () => {
    const items: FileRingItem[] = [
      { kind: "action", action: "search" },
      { kind: "action", action: "new-folder" },
    ];
    const layout = layoutRing(items, [], dragActions(true));
    expect(layout["top-left"]).toEqual({
      kind: "action",
      action: "search",
      disabled: true,
    });
    expect(layout["top-right"]).toEqual({
      kind: "action",
      action: "new-folder",
      disabled: false,
    });
    expect(
      ringOpens(layoutRing(items.slice(0, 1), [], dragActions(true)), true),
    ).toBe(false);
  });
});

describe("ring drops", () => {
  const auto = autoRingItems(rows, {}, ids(rows));
  const layout = layoutRing(auto, rows, dragActions(false));

  it("adds every dragged Save to the folder under the drop", () => {
    const { calls, handlers } = recordingHandlers();
    expect(dropOnRing(layout.right, ["a", "b"], handlers)).toBe(true);
    expect(calls).toEqual(["add a,b to portraits"]);
  });

  it("runs the action under the drop", () => {
    const { calls, handlers } = recordingHandlers();
    const exportable = layoutRing(auto, rows, dragActions(true))["top-right"];
    expect(dropOnRing(layout["top-left"], ["a", "b"], handlers)).toBe(true);
    expect(dropOnRing(exportable, ["a"], handlers)).toBe(true);
    expect(calls).toEqual(["create a,b", "export a"]);
  });

  it("refuses Export Files when the drag has no way to export", () => {
    const { calls, handlers } = recordingHandlers();
    const withoutExport = {
      addToFolder: handlers.addToFolder,
      createFolder: handlers.createFolder,
    };
    const exportable = layoutRing(auto, rows, dragActions(true))["top-right"];
    expect(dropOnRing(exportable, ["a"], withoutExport)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("ignores empty slots and turned off actions", () => {
    const { calls, handlers } = recordingHandlers();
    expect(dropOnRing(layout["top-right"], ["a"], handlers)).toBe(false);
    const empty = layoutRing([], rows, dragActions(true)).left;
    expect(dropOnRing(empty, ["a"], handlers)).toBe(false);
    expect(calls).toEqual([]);
  });
});
