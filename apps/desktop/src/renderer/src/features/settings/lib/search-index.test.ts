// @vitest-environment jsdom
import { SETTINGS_GROUP_LABELS, SETTINGS_SECTIONS } from "@pond/schema";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_MASTER_GROUPS,
  sectionForId,
  sectionForPath,
} from "./registry";
import { SETTINGS_SEARCH_INDEX, sectionEntries } from "./search-index";

function entry(id: string) {
  const result = SETTINGS_SEARCH_INDEX.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing Settings search entry: ${id}`);
  return result;
}

describe("settings search index", () => {
  it("routes custom rows to their focused pages", () => {
    expect(entry("library:logo").path).toBe("library");
    expect(entry("library:name").path).toBe("library");
    expect(entry("storage:location").path).toBe("storage");
    expect(entry("backups:backup").path).toBe("backups");
  });

  it("omits actions owned by application menus", () => {
    for (const id of [
      "library:new",
      "library:open",
      "library:merge",
      "library:package",
      "library:import",
      "harvesting:watched-folder",
    ]) {
      expect(
        SETTINGS_SEARCH_INDEX.some((candidate) => candidate.id === id),
      ).toBe(false);
    }
  });

  it("indexes setting tooltips with their row", () => {
    expect(entry("extension:altClick").description).toContain("Option");
    expect(entry("videos:maxHeight").description).toContain("bigger files");
  });

  it("indexes semantic search under processing", () => {
    expect(entry("processing:semanticSearch").sectionLabel).toBe("Processing");
    expect(entry("processing:enableClip").sectionLabel).toBe("Processing");
    expect(entry("shortcuts").sectionLabel).toBe("Hotkeys");
    expect(entry("viewer").sectionLabel).toBe("Preview");
  });

  it("keeps group headings distinct from their items", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.label).not.toBe(SETTINGS_GROUP_LABELS[section.group]);
    }
  });

  it("indexes the global download settings under Images and Videos", () => {
    expect(entry("videos:autoDownload").title).toBe(
      "Download Videos Automatically",
    );
    expect(entry("videos:autoDownload").groupTitle).toBe("Downloads");
    expect(entry("images:maxLongEdge").sectionLabel).toBe("Images");
    expect(entry("storage:autoArchive").title).toBe(
      "Archive Web Pages Automatically",
    );
    expect(entry("storage:autoArchive").groupTitle).toBe("Web Pages");
  });

  it("indexes the Harvesting pages under their own labels", () => {
    expect(entry("schedule").sectionLabel).toBe("Schedule");
    expect(entry("sources").sectionLabel).toBe("Sources");
  });

  it("leaves hidden sections out of search", () => {
    const hidden = new Set(
      SETTINGS_SECTIONS.filter((section) => section.hidden).map(
        (section) => section.id,
      ),
    );
    expect(hidden.has("sources-youtube")).toBe(true);
    expect(
      SETTINGS_SEARCH_INDEX.filter((candidate) =>
        hidden.has(candidate.sectionId),
      ),
    ).toEqual([]);
  });
});

describe("settings child sections", () => {
  it("registers a hidden page under Sources for each source", () => {
    const youtube = sectionForPath("sources-youtube");
    expect(youtube?.label).toBe("YouTube");
    expect(youtube?.parent).toBe("sources");
    expect(youtube?.hidden).toBe(true);
    expect(youtube?.config.title).toBe("YouTube");
  });

  it("keeps hidden sections out of the sidebar index", () => {
    const listed = SETTINGS_MASTER_GROUPS.flatMap((group) =>
      group.sections.map((section) => section.id),
    );
    expect(
      SETTINGS_MASTER_GROUPS.find((group) => group.group === "harvesting"),
    ).toMatchObject({ label: "Harvesting" });
    expect(
      SETTINGS_MASTER_GROUPS.find(
        (group) => group.group === "harvesting",
      )?.sections.map((section) => section.id),
    ).toEqual(["schedule", "sources", "images", "videos"]);
    expect(listed.some((id) => sectionForId(id)?.hidden)).toBe(false);
  });
});

describe("settings search index platform rows", () => {
  it("hides rows whose visibility never depends on a setting", () => {
    const general = sectionForId("general");
    if (!general) {
      throw new Error("Missing General settings section");
    }
    const ids = sectionEntries({
      ...general,
      config: {
        groups: [
          {
            items: [
              {
                control: "switch",
                key: "otherPlatform",
                title: "Other Platform",
                visible: () => false,
              },
              {
                control: "switch",
                key: "darkOnly",
                title: "Dark Only",
                visible: (values) => values.appearance === "dark",
              },
            ],
          },
        ],
      },
    }).map((candidate) => candidate.id);
    expect(ids).not.toContain("general:otherPlatform");
    expect(ids).toContain("general:darkOnly");
  });

  it("keeps macOS-only rows on macOS", () => {
    const ids = SETTINGS_SEARCH_INDEX.map((candidate) => candidate.id);
    expect(ids).toContain("general:dockVisibility");
    expect(ids).toContain("general:raycast");
  });
});
