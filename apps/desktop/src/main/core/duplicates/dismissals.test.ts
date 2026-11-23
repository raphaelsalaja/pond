import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeBundleJson } from "../../lib/library-config";
import { addDismissals, dismissalsFile, readDismissals } from "./dismissals";

describe("duplicate dismissals", () => {
  let root: string;
  let file: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pond-dismissals-"));
    file = dismissalsFile(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lives in the Library's duplicates folder", () => {
    expect(file).toBe(join(root, "duplicates", "dismissed.json"));
  });

  it("stores each pair once, ordered, and records a new relation", () => {
    expect(readDismissals(file)).toEqual([]);
    expect(
      addDismissals(
        [
          { ids: ["two", "one"], relation: "overlap" },
          { ids: ["one", "two"], relation: "overlap" },
          { ids: ["same", "same"], relation: "near" },
        ],
        file,
      ),
    ).toBe(1);
    expect(
      addDismissals([{ ids: ["one", "two"], relation: "overlap" }], file),
    ).toBe(0);
    expect(
      addDismissals([{ ids: ["two", "one"], relation: "near" }], file),
    ).toBe(1);
    expect(readDismissals(file)).toEqual([
      { ids: ["one", "two"], relation: "near" },
    ]);
  });

  it("keeps valid entries when one is damaged", () => {
    writeBundleJson(file, [
      { ids: ["a", "b"], relation: "exact" },
      { ids: ["c"], relation: "near" },
      { ids: ["d", "e"], relation: "unknown" },
    ]);
    expect(readDismissals(file)).toEqual([
      { ids: ["a", "b"], relation: "exact" },
    ]);
  });
});
