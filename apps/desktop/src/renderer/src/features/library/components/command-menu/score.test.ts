import { describe, expect, it } from "vitest";
import { MIN_SCORE, matchItem, matchRanges, withinOneEdit } from "./score";

function score(label: string, query: string, keywords?: string): number {
  return matchItem({ label, keywords }, query)?.score ?? 0;
}

describe("command menu scoring", () => {
  it("ranks an exact label above a prefix, and a prefix above a keyword hit", () => {
    const exact = score("Trash", "trash");
    const prefix = score("Trash Settings", "trash");
    const keyword = score("Library", "trash", "deleted trashcan");
    expect(exact).toBe(1);
    expect(prefix).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it("treats an exact keyword as an exact match", () => {
    expect(score("Trash", "bin", "deleted bin")).toBe(1);
  });

  it("prefers word starts over letters buried mid-word", () => {
    expect(score("New Folder", "fold")).toBeGreaterThan(
      score("Unfolded Notes", "fold"),
    );
  });

  it("rewards query words in label order", () => {
    expect(score("Import Folders", "import fold")).toBeGreaterThan(
      score("Folders Import", "import fold"),
    );
  });

  it("matches initials", () => {
    expect(score("New Folder", "nf")).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(score("Open Settings", "os")).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it("tolerates one typo, ranked below clean matches", () => {
    const typo = score("Open Settings", "settigns");
    const substitution = score("New Folder", "foldar");
    expect(typo).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(substitution).toBeGreaterThanOrEqual(MIN_SCORE);
    expect(substitution).toBeLessThan(score("New Folder", "folder"));
    expect(score("New Folder", "fxldxr")).toBe(0);
  });

  it("ignores case and accents", () => {
    expect(score("Café Posters", "cafe")).toBeGreaterThan(0.5);
  });

  it("rejects unrelated text", () => {
    expect(matchItem({ label: "Open Settings" }, "zebra")).toBeNull();
    expect(matchItem({ label: "Downloads" }, "xq")).toBeNull();
  });

  it("highlights matched words, typos, and initials", () => {
    expect(matchRanges("Open Settings", "sett")).toEqual([[5, 9]]);
    expect(matchRanges("New Folder", "nf")).toEqual([
      [0, 1],
      [4, 5],
    ]);
    expect(matchRanges("Open Settings", "settigns")).toEqual([[5, 13]]);
  });

  it("counts one edit, including an adjacent swap", () => {
    expect(withinOneEdit("folder", "fodler")).toBe(true);
    expect(withinOneEdit("folder", "folde")).toBe(true);
    expect(withinOneEdit("folder", "foldar")).toBe(true);
    expect(withinOneEdit("folder", "fxldxr")).toBe(false);
  });
});
