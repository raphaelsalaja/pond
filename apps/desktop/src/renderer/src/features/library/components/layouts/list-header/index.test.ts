import { describe, expect, it, vi } from "vitest";
import {
  LIST_COLUMN_DEFAULTS,
  LIST_COLUMN_OPTIONS,
} from "@/features/saves/state/list-columns";
import { buildListColumnItems } from ".";

describe("list header column menu", () => {
  it("exposes every column as a checked command", () => {
    const onChange = vi.fn();
    const items = buildListColumnItems(LIST_COLUMN_DEFAULTS, onChange);
    expect(items).toHaveLength(LIST_COLUMN_OPTIONS.length);
    expect(
      items.find((item) => "label" in item && item.label === "Date Added"),
    ).toMatchObject({ type: "checkbox", checked: true });
    const tags = items.find((item) => "label" in item && item.label === "Tags");
    if (tags?.type !== "checkbox") throw new Error("Missing tags column");
    tags.onCheckedChange?.(true);
    expect(onChange).toHaveBeenCalledWith("tags", true);
  });
});
