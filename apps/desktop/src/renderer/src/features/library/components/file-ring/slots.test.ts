import { describe, expect, it } from "vitest";
import {
  dropOnRing,
  layoutRing,
  pickRingFolders,
  type RingDropHandlers,
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
  const handlers: RingDropHandlers<Row> = {
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

describe("ring layout", () => {
  it("fills the sides before the bottom and keeps the actions on top", () => {
    const layout = layoutRing(rows.slice(0, 3), true);
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
    const layout = layoutRing(rows, false);
    expect(layout["top-right"]).toMatchObject({ disabled: true });
    expect(layout["top-left"]).toMatchObject({ disabled: false });
  });
});

describe("ring drops", () => {
  const layout = layoutRing(rows, false);

  it("adds every dragged Save to the folder under the drop", () => {
    const { calls, handlers } = recordingHandlers();
    expect(dropOnRing(layout.right, ["a", "b"], handlers)).toBe(true);
    expect(calls).toEqual(["add a,b to portraits"]);
  });

  it("runs the action under the drop", () => {
    const { calls, handlers } = recordingHandlers();
    const exportable = layoutRing(rows, true)["top-right"];
    expect(dropOnRing(layout["top-left"], ["a", "b"], handlers)).toBe(true);
    expect(dropOnRing(exportable, ["a"], handlers)).toBe(true);
    expect(calls).toEqual(["create a,b", "export a"]);
  });

  it("ignores empty slots, turned off actions, and empty drags", () => {
    const { calls, handlers } = recordingHandlers();
    expect(dropOnRing(layout["top-right"], ["a"], handlers)).toBe(false);
    const empty = layoutRing([], true).left;
    expect(dropOnRing(empty, ["a"], handlers)).toBe(false);
    expect(dropOnRing(layout.left, [], handlers)).toBe(false);
    expect(calls).toEqual([]);
  });
});
