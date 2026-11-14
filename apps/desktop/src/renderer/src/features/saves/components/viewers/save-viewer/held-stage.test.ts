import { describe, expect, it } from "vitest";
import {
  expire,
  retarget,
  type Stage,
  type StageEntry,
  settle,
  stageLayers,
} from "./held-stage";

function media(key: string): StageEntry<string> {
  return { key, holds: true, value: key };
}

function file(key: string): StageEntry<string> {
  return { key, holds: false, value: key };
}

const empty: Stage<string> = { shown: null, pending: null };

describe("held stage", () => {
  it("shows the first media at once, with nothing to hold", () => {
    expect(retarget(empty, media("a"))).toEqual({
      shown: media("a"),
      pending: null,
    });
  });

  it("holds the shown media while the next media loads", () => {
    const stage = retarget(retarget(empty, media("a")), media("b"));

    expect(stage).toEqual({ shown: media("a"), pending: media("b") });
    expect(
      stageLayers(stage).map(({ entry, role }) => [entry.key, role]),
    ).toEqual([
      ["a", "held"],
      ["b", "pending"],
    ]);
  });

  it("swaps once the pending media is ready", () => {
    const stage = settle(
      retarget(retarget(empty, media("a")), media("b")),
      "b",
    );

    expect(stage).toEqual({ shown: media("b"), pending: null });
    expect(stageLayers(stage)).toEqual([
      { entry: media("b"), role: "current" },
    ]);
  });

  it("abandons the pending media when you step again before it is ready", () => {
    let stage = retarget(empty, media("a"));
    stage = retarget(stage, media("b"));
    stage = retarget(stage, media("c"));

    expect(stage).toEqual({ shown: media("a"), pending: media("c") });
    expect(settle(stage, "b")).toBe(stage);
    expect(settle(stage, "c")).toEqual({ shown: media("c"), pending: null });
  });

  it("drops the pending media when you step back to the shown one", () => {
    const stage = retarget(retarget(empty, media("a")), media("b"));

    expect(retarget(stage, media("a"))).toEqual({
      shown: media("a"),
      pending: null,
    });
  });

  it("swaps to the newest target when the hold expires", () => {
    let stage = retarget(empty, media("a"));
    stage = retarget(stage, media("b"));
    stage = retarget(stage, media("c"));

    expect(expire(stage)).toEqual({ shown: media("c"), pending: null });
    expect(expire({ shown: media("c"), pending: null })).toEqual({
      shown: media("c"),
      pending: null,
    });
  });

  it("swaps at once when either side is not held media", () => {
    expect(retarget(retarget(empty, media("a")), file("pdf"))).toEqual({
      shown: file("pdf"),
      pending: null,
    });
    expect(retarget(retarget(empty, file("pdf")), media("a"))).toEqual({
      shown: media("a"),
      pending: null,
    });
  });

  it("clears the stage when there is nothing to show", () => {
    const stage = retarget(retarget(empty, media("a")), media("b"));

    expect(retarget(stage, null)).toEqual(empty);
    expect(stageLayers(empty)).toEqual([]);
  });
});
