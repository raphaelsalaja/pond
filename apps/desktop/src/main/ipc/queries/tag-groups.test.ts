import { describe, expect, it } from "vitest";
import { createMergeGroupQuery, tagGroupsQueries } from "./tag-groups";

function recordingMerge(affected: number) {
  const calls: Array<[string, string]> = [];
  const merge = async (from: string, to: string) => {
    calls.push([from, to]);
    return { ok: true as const, affected };
  };
  return { merge, calls };
}

describe("tag group queries", () => {
  it("registers and delegates a valid merge request", async () => {
    const { merge, calls } = recordingMerge(2);
    const handler = createMergeGroupQuery(merge);

    await expect(
      handler({ from: " Source ", to: " Target " }),
    ).resolves.toEqual({ ok: true, affected: 2 });
    expect(calls).toEqual([["Source", "Target"]]);
    expect(tagGroupsQueries).toHaveProperty("tagGroups.merge");
  });

  it("rejects malformed input before calling the operation", () => {
    const { merge, calls } = recordingMerge(0);
    const handler = createMergeGroupQuery(merge);

    expect(() => handler({ from: "", to: "Target" })).toThrow();
    expect(() => handler({ from: 42, to: "Target" })).toThrow();
    expect(calls).toEqual([]);
  });

  it("propagates operation failures", async () => {
    const failure = new Error("commit failed");
    const handler = createMergeGroupQuery(async () => {
      throw failure;
    });

    await expect(handler({ from: "Source", to: "Target" })).rejects.toBe(
      failure,
    );
  });
});
