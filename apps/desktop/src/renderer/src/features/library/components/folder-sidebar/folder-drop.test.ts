import { describe, expect, it } from "vitest";
import {
  FOLDER_DRAG_TYPE,
  FOLDER_NEST_DWELL_MS,
  FOLDER_ROOT_DROP_ID,
  type FolderDropTarget,
  folderDropKind,
  isFolderDrag,
  pickFolderDropZone,
  planFolderDrop,
  planFolderSidebarDrop,
  resolveFolderDropTarget,
} from "./folder-drop";

const travel = { id: "travel", parentId: null };
const tickets = { id: "tickets", parentId: "travel" };
const receipts = { id: "receipts", parentId: "travel" };
const shots = { id: "shots", parentId: null };
const folders = [travel, tickets, receipts, shots];

describe("folder sidebar drop", () => {
  it("recognizes a folder drag type case-insensitively", () => {
    expect(isFolderDrag([FOLDER_DRAG_TYPE])).toBe(true);
    expect(isFolderDrag(["APPLICATION/X-POND-FOLDER"])).toBe(true);
    expect(isFolderDrag(["text/plain"])).toBe(false);
  });

  it("keeps most of a row for reordering and only its middle for nesting", () => {
    expect(folderDropKind(0, 28)).toBe("before");
    expect(folderDropKind(9, 28)).toBe("before");
    expect(folderDropKind(11, 28)).toBe("into");
    expect(folderDropKind(14, 28)).toBe("into");
    expect(folderDropKind(17, 28)).toBe("into");
    expect(folderDropKind(19, 28)).toBe("after");
    expect(folderDropKind(28, 28)).toBe("after");
    expect(folderDropKind(0, 0)).toBe("into");
  });

  it("places beside a row until the pointer rests in its nest band", () => {
    const entering = pickFolderDropZone({
      id: "travel",
      offsetY: 13,
      height: 28,
      now: 1000,
      dwell: null,
    });
    expect(entering).toEqual({
      kind: "before",
      dwell: { id: "travel", since: 1000 },
      armsIn: FOLDER_NEST_DWELL_MS,
    });

    const waiting = pickFolderDropZone({
      id: "travel",
      offsetY: 15,
      height: 28,
      now: 1100,
      dwell: entering.dwell,
    });
    expect(waiting).toEqual({
      kind: "after",
      dwell: { id: "travel", since: 1000 },
      armsIn: FOLDER_NEST_DWELL_MS - 100,
    });

    expect(
      pickFolderDropZone({
        id: "travel",
        offsetY: 15,
        height: 28,
        now: 1000 + FOLDER_NEST_DWELL_MS,
        dwell: waiting.dwell,
      }),
    ).toEqual({ kind: "into", dwell: { id: "travel", since: 1000 } });
  });

  it("restarts the nest dwell on a new row or after leaving the band", () => {
    const resting = { id: "travel", since: 0 };
    expect(
      pickFolderDropZone({
        id: "shots",
        offsetY: 14,
        height: 28,
        now: 5000,
        dwell: resting,
      }),
    ).toEqual({
      kind: "after",
      dwell: { id: "shots", since: 5000 },
      armsIn: FOLDER_NEST_DWELL_MS,
    });
    expect(
      pickFolderDropZone({
        id: "travel",
        offsetY: 2,
        height: 28,
        now: 5000,
        dwell: resting,
      }),
    ).toEqual({ kind: "before", dwell: null });
  });

  it("lands an after drop on an expanded folder above its first child", () => {
    const visible = [travel, tickets, receipts, shots];
    const afterTravel: FolderDropTarget = { id: "travel", kind: "after" };
    expect(resolveFolderDropTarget(afterTravel, visible)).toEqual({
      id: "tickets",
      kind: "before",
    });
    expect(resolveFolderDropTarget(afterTravel, [travel, shots])).toEqual(
      afterTravel,
    );
    expect(
      resolveFolderDropTarget({ id: "receipts", kind: "after" }, visible),
    ).toEqual({ id: "receipts", kind: "after" });
    expect(
      resolveFolderDropTarget({ id: "travel", kind: "into" }, visible),
    ).toEqual({ id: "travel", kind: "into" });
  });

  it("moves a folder to the end of the top level", () => {
    const root: FolderDropTarget = { id: FOLDER_ROOT_DROP_ID, kind: "after" };
    expect(planFolderDrop("tickets", root, folders)).toEqual({
      id: "tickets",
      parentId: null,
    });
    expect(planFolderDrop("shots", root, folders)).toBeNull();
    expect(planFolderDrop("travel", root, folders)).toEqual({
      id: "travel",
      parentId: null,
    });
  });

  it("plans a row drop and ignores a missing row", () => {
    expect(
      planFolderDrop("shots", { id: "tickets", kind: "before" }, folders),
    ).toEqual({ id: "shots", parentId: "travel", beforeId: "tickets" });
    expect(
      planFolderDrop("shots", { id: "gone", kind: "into" }, folders),
    ).toBeNull();
  });

  it("nests a folder inside the drop target", () => {
    expect(planFolderSidebarDrop("shots", travel, "into", folders)).toEqual({
      id: "shots",
      parentId: "travel",
    });
  });

  it("rejects dropping a folder into itself or a descendant", () => {
    expect(planFolderSidebarDrop("travel", travel, "into", folders)).toBeNull();
    expect(
      planFolderSidebarDrop("travel", tickets, "into", folders),
    ).toBeNull();
    expect(
      planFolderSidebarDrop("travel", tickets, "before", folders),
    ).toBeNull();
  });

  it("reorders a folder before a sibling", () => {
    expect(planFolderSidebarDrop("shots", travel, "before", folders)).toEqual({
      id: "shots",
      parentId: null,
      beforeId: "travel",
    });
  });

  it("reorders a folder after a sibling, skipping a no-op", () => {
    expect(planFolderSidebarDrop("shots", travel, "after", folders)).toBeNull();
    expect(
      planFolderSidebarDrop("tickets", receipts, "after", folders),
    ).toEqual({ id: "tickets", parentId: "travel" });
  });
});
