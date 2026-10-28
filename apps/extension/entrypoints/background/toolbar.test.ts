import { describe, expect, it } from "vitest";
import type { ToolbarAction } from "@/utils/types";
import { createToolbarApply, toolbarSkipsDetails } from "./toolbar";

describe("toolbarSkipsDetails", () => {
  it("saves in one click only for Save Page", () => {
    expect(toolbarSkipsDetails("save")).toBe(true);
    expect(toolbarSkipsDetails("popup")).toBe(false);
  });
});

describe("createToolbarApply", () => {
  it("drops a settings read that finishes after a newer one", async () => {
    let resolveStale: (action: ToolbarAction) => void = () => {};
    const applied: ToolbarAction[] = [];
    let reads = 0;
    const applyCurrent = createToolbarApply({
      read: () => {
        reads += 1;
        if (reads === 1) {
          return new Promise((resolve) => {
            resolveStale = resolve;
          });
        }
        return Promise.resolve("save");
      },
      apply: async (action) => {
        applied.push(action);
      },
    });

    const stale = applyCurrent();
    await applyCurrent();
    resolveStale("popup");
    await stale;

    expect(applied).toEqual(["save"]);
  });
});
