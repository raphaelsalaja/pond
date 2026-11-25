import { expect, it } from "vitest";
import { detailsColumn } from "./details-column";

it("keeps the page's own Details column while no Save is open", () => {
  expect(detailsColumn("fish", false)).toBe("fish");
  expect(detailsColumn("save", false)).toBe("save");
});

it("gives the Details column to a Save opened over the Fish page", () => {
  expect(detailsColumn("fish", true)).toBe("save");
  expect(detailsColumn("save", true)).toBe("save");
});

it("leaves a page without a Details column without one", () => {
  expect(detailsColumn(null, false)).toBeNull();
  expect(detailsColumn(null, true)).toBeNull();
});
