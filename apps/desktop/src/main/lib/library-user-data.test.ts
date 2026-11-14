import { describe, expect, it } from "vitest";
import {
  applyPatchToInfo,
  patchTouchesInfo,
  StoredInfoDocSchema,
} from "./library-format";

describe("portable save metadata", () => {
  it("stores and clears ratings and transforms without changing original refs", () => {
    const info = StoredInfoDocSchema.parse({
      id: "save",
      files: [
        { path: "original.png", kind: "image", sha256: "hash", size: 42 },
      ],
      folderIds: ["project"],
    });
    const changed = applyPatchToInfo(info, {
      rating: 4,
      rotate: 90,
      crop: { x: 0, y: 0, w: 0.5, h: 0.5 },
    });
    expect(StoredInfoDocSchema.parse(changed).userData?.rating).toBe(4);
    expect(changed.files).toEqual(info.files);
    expect(changed.folderIds).toEqual(["project"]);
    const cleared = applyPatchToInfo(StoredInfoDocSchema.parse(changed), {
      rating: null,
      crop: null,
    });
    expect(cleared.userData).toMatchObject({
      rating: null,
      crop: null,
      rotate: 90,
    });
    expect(patchTouchesInfo({ rating: 1 })).toBe(true);
  });

  it("stores Inbox state in userData and keeps it through other user edits", () => {
    const legacy = StoredInfoDocSchema.parse({
      id: "save",
      userData: {
        rating: null,
        dominantColors: [],
        rotate: 0,
        flipX: false,
        flipY: false,
        crop: null,
      },
    });
    expect(legacy.userData).toMatchObject({
      inboxState: null,
      inboxUntil: null,
    });
    expect(patchTouchesInfo({ inboxState: "processed" })).toBe(true);
    const snoozed = applyPatchToInfo(legacy, {
      inboxState: "snoozed",
      inboxUntil: 1_900_000_000_000,
    });
    const rated = applyPatchToInfo(StoredInfoDocSchema.parse(snoozed), {
      rating: 3,
    });
    expect(StoredInfoDocSchema.parse(rated).userData).toMatchObject({
      rating: 3,
      inboxState: "snoozed",
      inboxUntil: 1_900_000_000_000,
    });
    expect(
      StoredInfoDocSchema.parse({
        id: "save",
        userData: { ...rated.userData, inboxState: "archived" },
      }).userData?.inboxState,
    ).toBeNull();
  });

  it("keeps where an imported save came from across later edits", () => {
    const info = StoredInfoDocSchema.parse({ id: "save", source: "web" });
    expect(info.importedFrom).toBeUndefined();
    expect(patchTouchesInfo({ importedFrom: "bookmarks" })).toBe(true);
    const imported = applyPatchToInfo(info, { importedFrom: "bookmarks" });
    const edited = applyPatchToInfo(StoredInfoDocSchema.parse(imported), {
      title: "Renamed",
    });
    expect(StoredInfoDocSchema.parse(edited).importedFrom).toBe("bookmarks");
  });
});
