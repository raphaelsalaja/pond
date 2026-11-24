import { beforeEach, describe, expect, it } from "vitest";
import { menuLabels } from "@/shared/test/menu-labels";
import { bridge } from "@/shared/test/pond-bridge";
import { buildEmptyGalleryMenu } from "./empty-gallery-menu";

describe("empty gallery menu", () => {
  beforeEach(() => {
    bridge.use({
      query: {
        "saves.listBlankDocuments": () => ({ kinds: [], icons: {} }),
      },
    });
  });
  it("shares the New menu spec", () => {
    const labels = menuLabels(buildEmptyGalleryMenu());
    expect(labels.slice(0, 2)).toEqual(["New", "New Folder"]);
    expect(labels).toContain("New Smart Folder");
    expect(labels).toContain("Find Duplicates");
    expect(labels).toContain("New Note");
    expect(labels).toContain("Rescan Library");
    expect(labels).toContain("Verify Integrity");
    expect(labels).toContain("Pinterest");
    expect(labels.join(" ")).toContain("ArtStation");
    expect(labels.join(" ")).toContain("Huaban");
    expect(labels.join(" ")).not.toContain("Plugin");
    expect(labels.join(" ")).not.toContain("…");
  });
});
