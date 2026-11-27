import { describe, expect, it } from "vitest";
import type {
  DuplicatePair,
  DuplicateRelation,
} from "../../../shared/duplicate-contracts";
import { groupPairs } from "./group";

function pair(
  left: string,
  right: string,
  relation: DuplicateRelation,
): DuplicatePair {
  return {
    ids: [left, right],
    relation,
    saveEvidence: [],
    assetEvidence: [],
    coverage: { left: 1, leftTotal: 1, right: 1, rightTotal: 1 },
  };
}

describe("groupPairs", () => {
  it("lists every pair among a group's Saves, whatever its relation, in position order", () => {
    const pairs = [
      pair("A", "B", "exact"),
      pair("B", "C", "exact"),
      pair("A", "C", "overlap"),
      pair("C", "D", "related"),
    ];

    expect(groupPairs(pairs)).toEqual([
      { relation: "exact", ids: ["A", "B", "C"], pairs: [0, 1, 2] },
      { relation: "related", ids: ["C", "D"], pairs: [3] },
    ]);
  });

  it("gives a near group the pairs of the exact copies it absorbs", () => {
    const pairs = [
      pair("A", "B", "exact"),
      pair("A", "C", "near"),
      pair("B", "C", "near"),
    ];

    expect(groupPairs(pairs)).toEqual([
      { relation: "near", ids: ["A", "B", "C"], pairs: [0, 1, 2] },
    ]);
  });

  it("lists the pairs of a long chain of exact copies", () => {
    const ids = Array.from(
      { length: 3000 },
      (_, index) => `S${index.toString().padStart(5, "0")}`,
    );
    const pairs = ids
      .slice(1)
      .map((id, index) => pair(ids[index] ?? "", id, "exact"));

    const [group, ...rest] = groupPairs(pairs);

    expect(rest).toEqual([]);
    expect(group?.ids).toEqual(ids);
    expect(group?.pairs).toEqual(pairs.map((_, position) => position));
  });
});
