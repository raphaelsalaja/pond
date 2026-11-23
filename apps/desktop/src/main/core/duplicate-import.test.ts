import { describe, expect, it } from "vitest";
import {
  type DuplicateImportCandidate,
  resolveDuplicateDecisions,
} from "./duplicate-import";

const live: DuplicateImportCandidate = {
  path: "/imports/live.png",
  filename: "live.png",
  existingId: "save-live",
  existingTitle: null,
  inTrash: false,
};

const trashed: DuplicateImportCandidate = {
  path: "/imports/trashed.png",
  filename: "trashed.png",
  existingId: "save-trashed",
  existingTitle: null,
  inTrash: true,
};

describe("resolving duplicate decisions", () => {
  it("never restores from Trash on a use-existing policy", () => {
    const resolved = resolveDuplicateDecisions(
      [live, trashed],
      {},
      "use-existing",
    );
    expect(resolved.useExisting).toEqual({ [live.path]: "save-live" });
    expect([...resolved.restore]).toEqual([]);
  });

  it("imports a trashed match as new when told to use the existing Save", () => {
    const resolved = resolveDuplicateDecisions(
      [trashed],
      { [trashed.path]: "use-existing" },
      "keep-both",
    );
    expect(resolved.useExisting).toEqual({});
    expect([...resolved.restore]).toEqual([]);
  });

  it("restores a trashed match only on an explicit restore", () => {
    const resolved = resolveDuplicateDecisions(
      [live, trashed],
      { [live.path]: "keep-both", [trashed.path]: "restore" },
      "keep-both",
    );
    expect(resolved.useExisting).toEqual({ [trashed.path]: "save-trashed" });
    expect([...resolved.restore]).toEqual([trashed.path]);
  });
});
