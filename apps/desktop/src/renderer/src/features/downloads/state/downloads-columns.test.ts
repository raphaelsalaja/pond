import { beforeEach, describe, expect, it } from "vitest";
import {
  downloadsColumnsLayout,
  mergeVisibleColumnOrder,
  normalizeDownloadsColumnLayout,
} from "./downloads-columns";

describe("downloads column layout", () => {
  beforeEach(() => {
    downloadsColumnsLayout.reset();
  });

  it("shows Name, Status, Progress, and Added by default", () => {
    const { order, hidden } = downloadsColumnsLayout.snapshot();
    expect(order.filter((id) => !hidden.includes(id))).toEqual([
      "name",
      "stage",
      "progress",
      "added",
    ]);
  });

  it("keeps Name visible and restores a hidden column in its place", () => {
    downloadsColumnsLayout.setHidden("name", true);
    downloadsColumnsLayout.setHidden("stage", true);
    expect(downloadsColumnsLayout.snapshot().hidden).toContain("stage");
    expect(downloadsColumnsLayout.snapshot().hidden).not.toContain("name");
    downloadsColumnsLayout.setHidden("speed", false);
    expect(downloadsColumnsLayout.snapshot().hidden).not.toContain("speed");
    expect(downloadsColumnsLayout.snapshot().order).toContain("speed");
  });

  it("reorders visible columns without moving a hidden one", () => {
    const next = mergeVisibleColumnOrder(
      downloadsColumnsLayout.snapshot().order,
      ["stage"],
      ["name", "speed", "size", "remaining", "progress", "added"],
    );
    expect(next.indexOf("stage")).toBeLessThan(next.indexOf("size"));
    expect(next.indexOf("speed")).toBeLessThan(next.indexOf("size"));
  });

  it("keeps a known sort and drops an unknown one", () => {
    downloadsColumnsLayout.setSort({ id: "added", desc: true });
    expect(downloadsColumnsLayout.snapshot().sort).toEqual({
      id: "added",
      desc: true,
    });
    expect(
      normalizeDownloadsColumnLayout({
        sort: { id: "missing", desc: true },
      }).sort,
    ).toBeNull();
  });

  it("drops unknown columns and appends new ones", () => {
    expect(
      normalizeDownloadsColumnLayout({
        order: ["added", "nope", "name"],
        hidden: ["name", "added", "missing"],
      }),
    ).toMatchObject({
      order: [
        "added",
        "name",
        "stage",
        "size",
        "speed",
        "remaining",
        "progress",
        "elapsed",
        "files",
        "attempts",
        "server",
        "error",
      ],
      hidden: ["added"],
    });
  });
});
