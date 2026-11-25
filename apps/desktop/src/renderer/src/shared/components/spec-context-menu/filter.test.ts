import type { MenuItemSpec } from "@pond/ui";
import { describe, expect, it } from "vitest";
import { menuLabels as labels } from "@/shared/test/menu-labels";
import { filterMenuItems } from "./filter";

const MENU: Array<MenuItemSpec> = [
  { label: "Open Save", onClick: () => {} },
  { type: "separator" },
  {
    type: "submenu",
    label: "Export",
    items: [
      { label: "Export Files", onClick: () => {} },
      { label: "Export to CSV", onClick: () => {} },
      { label: "Hidden Format", hidden: true, onClick: () => {} },
      { label: "Disabled Pack", disabled: true, onClick: () => {} },
    ],
  },
  {
    label: "Reveal in Finder",
    keywords: "explorer",
    onClick: () => {},
  },
  { type: "custom", render: () => null },
];

describe("filterMenuItems", () => {
  it("returns the original tree when the query is empty", () => {
    expect(filterMenuItems(MENU, "")).toBe(MENU);
    expect(filterMenuItems(MENU, "   ")).toBe(MENU);
  });

  it("renders a submenu match as one breadcrumb row", () => {
    const result = filterMenuItems(MENU, "csv");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "Export to CSV",
      breadcrumb: ["Export"],
    });
    expect(result[0]?.type).not.toBe("group");
  });

  it("drops separators, hidden rows, and disabled rows", () => {
    const result = filterMenuItems(MENU, "export");
    expect(labels(result)).toEqual(["Export Files", "Export to CSV"]);
    expect(result).toEqual([
      expect.objectContaining({ breadcrumb: ["Export"] }),
      expect.objectContaining({ breadcrumb: ["Export"] }),
    ]);
    expect(result.some((item) => item.type === "separator")).toBe(false);
  });

  it("matches each term anywhere along the breadcrumb path", () => {
    expect(labels(filterMenuItems(MENU, "export csv"))).toEqual([
      "Export to CSV",
    ]);
    expect(labels(filterMenuItems(MENU, "éxport FILES"))).toEqual([
      "Export Files",
    ]);
  });

  it("matches keywords on a leaf", () => {
    expect(labels(filterMenuItems(MENU, "explorer"))).toEqual([
      "Reveal in Finder",
    ]);
  });

  it("keeps color swatches when the query names them", () => {
    const result = filterMenuItems(MENU, "color");
    expect(result).toEqual([expect.objectContaining({ type: "custom" })]);
  });
});
