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
