import type { MenuItemSpec } from "@pond/ui";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { filterMenuItems } from "@/shared/components/spec-context-menu/filter";
import {
  menuLabels,
  menuLabelsWithoutIcons,
  topLevelMenuLabels,
} from "@/shared/test/menu-labels";
import { buildNewMenuItems } from "./spec";

function rows(items: MenuItemSpec[]): string[] {
  return items.map((item) =>
    "label" in item
      ? [...("breadcrumb" in item ? (item.breadcrumb ?? []) : []), item.label]
          .map(String)
          .join(" › ")
      : item.type,
  );
}

describe("new menu spec", () => {
  it("gives every searchable action an icon", () => {
    expect(menuLabelsWithoutIcons(buildNewMenuItems(["word"]))).toEqual([]);
  });

  it("orders create, import, connect, then tools", () => {
    const labels = menuLabels(buildNewMenuItems(["photoshop", "word"]));
    expect(labels).toEqual([
      "New",
      "New Folder",
      "New Smart Folder",
      "New Watched Folder",
      "New Tag",
      "New Tag Group",
      "New Note",
      "Photoshop Document",
      "Word Document",
      "Import",
      "Import Files",
      "Import Folders",
      "Import from Links",
      "Import from Clipboard",
      "Import Bookmarks",
      "Import mymind",
      "Import Data Export",
      "Import Page Assets",
      "Import Eagle Package",
      "Import Pond Package",
      "Import Eagle Library",
      "Import Legacy Library",
      "Import ArtStation Export",
      "Import Huaban Export",
      "Import Pixave Export",
      "Import Inboard Export",
      "Sources",
      "New Source",
      "Twitter",
      "Instagram",
      "Pinterest",
      "Are.na",
      "Cosmos",
      "TikTok",
      "YouTube",
      "Reddit",
      "Threads",
      "GitHub",
      "Substack",
      "Tumblr",
      "Savee",
      "Behance",
      "Vimeo",
      "Dribbble",
      "Unsplash",
      "Bluesky",
      "Marked",
      "New Watch",
      "Twitter",
      "Instagram",
      "Pinterest",
      "Are.na",
      "Cosmos",
      "TikTok",
      "YouTube",
      "Library",
      "Find Duplicates",
      "Scan All",
      "Current List",
      "Selected",
      "Review Organization",
      "All Saves",
      "Current List",
      "Selected",
      "Rescan Library",
      "Verify Integrity",
      "Repair Library",
      "Repair Thumbnails",
      "Repair Physical File Names",
      "Repair Invalid Content",
      "Repair Save Metadata",
      "Export Debug Report",
    ]);
    expect(labels.join(" ")).toContain("ArtStation");
    expect(labels.join(" ")).not.toContain("…");
    expect(labels).not.toContain("Create");
    expect(labels).not.toContain("Connect");
    expect(labels).not.toContain("Tools");
    expect(topLevelMenuLabels(buildNewMenuItems(["word"]))).toEqual([
      "New",
      "Import",
      "Sources",
      "Library",
    ]);
  });

  it("hides document types that are not installed", () => {
    expect(menuLabels(buildNewMenuItems([])).join(" ")).not.toContain(
      "Photoshop",
    );
  });

  it("uses the installed application's native icon for document actions", () => {
    const [newMenu] = buildNewMenuItems(["excel"], {
      excel: "data:image/png;base64,excel",
    });
    if (newMenu?.type !== "submenu") throw new Error("Missing New submenu");
    const excel = newMenu.items.find(
      (item) => "id" in item && item.id === "excel",
    );
    if (!excel || !("icon" in excel) || !isValidElement(excel.icon)) {
      throw new Error("Missing Excel icon");
    }
    expect(excel.icon.type).toBe("img");
    expect(excel.icon.props).toMatchObject({
      alt: "",
      src: "data:image/png;base64,excel",
    });
  });

  it("filters nested actions by search", () => {
    expect(
      rows(filterMenuItems(buildNewMenuItems(["word"]), "scan all")),
    ).toEqual([
      "Library › Find Duplicates › Scan All",
      "Library › Review Organization › All Saves",
    ]);
  });

  it("flattens submenu matches into breadcrumb rows", () => {
    expect(rows(filterMenuItems(buildNewMenuItems([]), "eagle"))).toEqual([
      "Import › Import Eagle Package",
      "Import › Import Eagle Library",
    ]);
  });
});
