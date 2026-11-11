import { describe, expect, it } from "vitest";
import { ruleChoices } from "./choices";

describe("smart folder rule choices", () => {
  it("labels a folder by its parent and a tag by its first group, then sorts that path", () => {
    expect(
      ruleChoices({
        folders: [
          { id: "yt-food", name: "Food", parentId: "youtube" },
          { id: "youtube", name: "YouTube", parentId: null },
          { id: "ig-food", name: "Food", parentId: "instagram" },
          { id: "instagram", name: "Instagram", parentId: null },
          { id: "orphan", name: "Loose", parentId: "missing" },
        ],
        tags: [{ name: "Motion" }, { name: "Design" }],
        tagGroups: [
          { name: "Craft", tagNames: ["motion"] },
          { name: "Later", tagNames: ["Motion"] },
        ],
      }),
    ).toEqual({
      folders: [
        { value: "instagram", label: "Instagram" },
        { value: "ig-food", label: "Food", crumb: "Instagram" },
        { value: "orphan", label: "Loose" },
        { value: "youtube", label: "YouTube" },
        { value: "yt-food", label: "Food", crumb: "YouTube" },
      ],
      tags: [
        { value: "Motion", label: "Motion", crumb: "Craft" },
        { value: "Design", label: "Design" },
      ],
    });
  });
});
