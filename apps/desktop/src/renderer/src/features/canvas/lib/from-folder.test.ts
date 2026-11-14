import { describe, expect, it } from "vitest";
import { folderSavesNotice, planFolderSaves } from "./from-folder";

describe("folder Saves on a canvas", () => {
  it("takes every Save for a new canvas once", () => {
    expect(planFolderSaves(["a", "b", "a", "c"])).toEqual({
      saveIds: ["a", "b", "c"],
      present: 0,
      overflow: 0,
    });
  });

  it("skips Saves already on the canvas and keeps folder order", () => {
    const plan = planFolderSaves(["c", "a", "d", "b"], {
      saveIds: ["a", "b"],
      itemCount: 6,
    });
    expect(plan).toEqual({ saveIds: ["c", "d"], present: 2, overflow: 0 });
    expect(folderSavesNotice("Moodboard", plan)).toEqual({
      title: 'Added 2 Saves to "Moodboard"',
      description: "Skipped 2 Saves already on the canvas.",
    });
  });

  it("stops at the canvas item limit and says how many didn't fit", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `save-${index}`);
    const plan = planFolderSaves(ids, { saveIds: [], itemCount: 4_990 });
    expect(plan.saveIds).toEqual(ids.slice(0, 10));
    expect(plan.overflow).toBe(2);
    expect(folderSavesNotice("Big", plan)).toEqual({
      title: 'Added 10 Saves to "Big"',
      description: "A canvas holds up to 5,000 items, so 2 Saves didn't fit.",
    });
  });

  it("reports a full canvas and a canvas that already has everything", () => {
    expect(
      folderSavesNotice(
        "Full",
        planFolderSaves(["a"], { saveIds: [], itemCount: 5_000 }),
      ).title,
    ).toBe('"Full" is full');
    expect(
      folderSavesNotice(
        "Done",
        planFolderSaves(["a", "b"], { saveIds: ["a", "b"], itemCount: 2 }),
      ),
    ).toEqual({
      title: 'Already on "Done"',
      description: "Every Save in this folder is on the canvas.",
    });
  });
});
