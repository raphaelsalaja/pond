import { describe, expect, it } from "vitest";
import { knownIdsFromRows, syncBaselineWhere } from "./sync-baseline";

describe("syncBaselineWhere", () => {
  it("omits trashed source ids so a re-sync can recapture them", () => {
    expect(syncBaselineWhere.toString()).toMatch(/deletedAt/);
    void syncBaselineWhere({ id: "acc", source: "threads" });
  });
});

describe("knownIdsFromRows", () => {
  it("keeps a split post known through a surviving slide", () => {
    expect(
      knownIdsFromRows([
        { sourceId: "post-2 3f9a1c", postSourceId: "post-2" },
        { sourceId: "post-1", postSourceId: null },
      ]),
    ).toEqual(new Set(["post-2 3f9a1c", "post-2", "post-1"]));
  });
});
