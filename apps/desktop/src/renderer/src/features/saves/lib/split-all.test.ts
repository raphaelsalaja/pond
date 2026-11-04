import type { SplitAllProgress } from "@shared/saves-mutation-contracts";
import { describe, expect, it } from "vitest";
import {
  splitAllDoneCopy,
  splitAllProgressText,
  splittableDescription,
} from "./split-all";

function progress(overrides: Partial<SplitAllProgress>): SplitAllProgress {
  return {
    running: false,
    total: 0,
    processed: 0,
    split: 0,
    created: 0,
    failed: 0,
    ...overrides,
  };
}

describe("split all copy", () => {
  it("counts the saves a split would change", () => {
    expect(splittableDescription(0)).toBe(
      "No saves have several images or videos.",
    );
    expect(splittableDescription(1)).toBe(
      "Splits 1 save with several images or videos, which can't be undone.",
    );
    expect(splittableDescription(1_200)).toBe(
      "Splits 1,200 saves with several images or videos, which can't be undone.",
    );
  });

  it("reports progress through the run", () => {
    expect(splitAllProgressText(progress({ processed: 20, total: 45 }))).toBe(
      "20 of 45 saves",
    );
  });

  it("sums up the run, failures included", () => {
    expect(splitAllDoneCopy(progress({ split: 12, created: 28 }))).toEqual({
      title: "Split 12 saves into 40",
      description: undefined,
    });
    expect(
      splitAllDoneCopy(progress({ split: 1, created: 2, failed: 2 })),
    ).toEqual({
      title: "Split 1 save into 3",
      description:
        "2 saves couldn't be split and are unchanged. Split again to retry.",
    });
    expect(splitAllDoneCopy(progress({ failed: 1 }))).toEqual({
      title: "Couldn't split",
      description:
        "1 save couldn't be split and is unchanged. Split again to retry.",
    });
    expect(splitAllDoneCopy(progress({}))).toEqual({
      title: "Nothing to split",
      description: undefined,
    });
  });
});
