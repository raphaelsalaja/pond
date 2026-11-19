import { expect, it } from "vitest";
import {
  addLocalDays,
  localDayPredicate,
} from "@/features/library/lib/local-day";
import { choiceOptions, presetOptions } from "./options";
import { filterSummary } from "./summary";

it("summarizes multiple types and negative filters using their display labels", () => {
  const options = presetOptions("type");
  expect(
    filterSummary(
      [{ field: "type", operator: "in", value: ["image", "video"] }],
      options,
    ),
  ).toBe("Image, Video");
  expect(
    filterSummary(
      [{ field: "type", operator: "nin", value: ["video"] }],
      options,
    ),
  ).toBe("Not Video");
  expect(
    filterSummary(
      [{ field: "type", operator: "eq", value: "video", negate: true }],
      options,
    ),
  ).toBe("Not Video");
});

it("keeps folder labels when selected through typed syntax", () => {
  expect(
    filterSummary(
      [{ field: "folder", operator: "some", value: ["FOLDER-A", "folder-b"] }],
      choiceOptions("folder", [
        { label: "Design", value: "folder-a" },
        { label: "Motion", value: "folder-b" },
      ]),
    ),
  ).toBe("Design, Motion");
});

it("does not invert absent notes or numeric exclusions twice", () => {
  expect(
    filterSummary(
      [{ field: "note", operator: "exists", value: false }],
      presetOptions("note"),
    ),
  ).toBe("Without Note");
  expect(
    filterSummary(
      [{ field: "fileCount", operator: "neq", value: 2 }],
      presetOptions("fileCount"),
    ),
  ).toBe("≠ 2 Files");
});

it("names the unit of numeric filters", () => {
  const summary = (rule: Parameters<typeof filterSummary>[0][number]) =>
    filterSummary([rule], presetOptions(rule.field));
  expect(summary({ field: "rating", operator: "gte", value: 3 })).toBe(
    "≥ 3 Stars",
  );
  expect(summary({ field: "rating", operator: "eq", value: 1 })).toBe("1 Star");
  expect(summary({ field: "fileCount", operator: "gte", value: 2 })).toBe(
    "≥ 2 Files",
  );
  expect(summary({ field: "fileSize", operator: "gt", value: 1_500_000 })).toBe(
    "> 1.5 MB",
  );
  expect(summary({ field: "width", operator: "gte", value: 1080 })).toBe(
    "≥ 1,080px",
  );
  expect(
    summary({ field: "duration", operator: "between", value: [10, 60] }),
  ).toBe("10s–1min");
});

it("prefixes dates with the field they filter", () => {
  const summary = (rule: Parameters<typeof filterSummary>[0][number]) =>
    filterSummary([rule], presetOptions(rule.field));
  expect(summary({ field: "savedAt", operator: "gte", value: "-P1W" })).toBe(
    "Saved Past Week",
  );
  expect(summary({ field: "savedAt", operator: "gte", value: "-P2W" })).toBe(
    "Saved Past 2 Weeks",
  );
  expect(
    summary({ field: "modifiedAt", operator: "gte", value: "2026-01-01" }),
  ).toBe("Modified Since Jan 1, 2026");
});

it("names a single-day range by its day", () => {
  const summary = (rule: Parameters<typeof filterSummary>[0][number]) =>
    filterSummary([rule], presetOptions(rule.field));
  const day = new Date(2026, 10, 14);
  const now = new Date(2026, 10, 19, 15);
  expect(summary(localDayPredicate("savedAt", day, now))).toBe(
    "Saved On Nov 14, 2026",
  );
  expect(
    summary(localDayPredicate("savedAt", addLocalDays(new Date(), -1))),
  ).toBe("Saved Yesterday");
  expect(summary(localDayPredicate("savedAt", new Date()))).toBe("Saved Today");
});

it("quotes text matches and names colors", () => {
  expect(
    filterSummary(
      [{ field: "note", operator: "contains", value: "ref" }],
      presetOptions("note"),
    ),
  ).toBe("“ref”");
  expect(
    filterSummary(
      [{ field: "color", operator: "near", value: "#2b76e7" }],
      presetOptions("color"),
    ),
  ).toBe("Blue");
});
