import type { WireSave } from "@shared/wire";
import { describe, expect, it, vi } from "vitest";
import { pool } from "@/features/saves/state/pool";
import { bridge } from "@/shared/test/pond-bridge";
import { applyActionCoalesced } from "./sync-coalesce";

/** Coalesced actions flush on the next animation frame, ahead of any callback registered after them. */
function frame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

describe("applyActionCoalesced", () => {
  it("ignores an update for a save it has never seen", async () => {
    applyActionCoalesced({
      modelName: "save",
      modelId: "unknown-1",
      action: "U",
      data: { status: "ingesting" },
    });
    await frame();
    expect(pool.get("unknown-1")).toBeUndefined();
  });

  it("keeps an update that carries the row's identity", async () => {
    applyActionCoalesced({
      modelName: "save",
      modelId: "known-1",
      action: "U",
      data: {
        id: "known-1",
        url: "https://x.com/a/status/1",
        status: "ingesting",
      },
    });
    await frame();
    expect(pool.get("known-1")?.url).toBe("https://x.com/a/status/1");
  });

  it("merges onto a save it already holds", async () => {
    applyActionCoalesced({
      modelName: "save",
      modelId: "known-2",
      action: "I",
      data: { id: "known-2", url: "https://x.com/b/status/2", title: "Two" },
    });
    await frame();
    applyActionCoalesced({
      modelName: "save",
      modelId: "known-2",
      action: "U",
      data: { status: "complete" },
    });
    await frame();
    expect(pool.get("known-2")?.title).toBe("Two");
    expect(pool.get("known-2")?.status).toBe("complete");
  });

  it("refetches the tasks of a save that stops between polls", async () => {
    const task = {
      op: "harvest_metadata" as const,
      attempts: 1,
      maxAttempts: 5,
      nextRunAt: 0,
      updatedAt: 1,
    };
    const row = {
      id: "known-3",
      url: "https://example.com/gone",
      status: "failed",
      tasks: [
        {
          ...task,
          status: "dead",
          lastError: "TerminalError: web fetch 404",
        },
      ],
    };
    /** SAFETY: reloadSaves parses rows through SavePatchesSchema, which fills every column this row omits. */
    bridge.use({ query: { "saves.getMany": () => [row as WireSave] } });
    applyActionCoalesced({
      modelName: "save",
      modelId: "known-3",
      action: "I",
      data: {
        id: "known-3",
        url: "https://example.com/gone",
        status: "ingesting",
        tasks: [{ ...task, status: "running", lastError: null }],
      },
    });
    await frame();
    applyActionCoalesced({
      modelName: "save",
      modelId: "known-3",
      action: "U",
      data: { status: "failed" },
    });
    await frame();
    expect(window.pond.query).toHaveBeenCalledWith("saves.getMany", {
      ids: ["known-3"],
    });
    await vi.waitFor(() => {
      expect(pool.get("known-3")?.tasks?.[0]?.status).toBe("dead");
    });

    applyActionCoalesced({
      modelName: "save",
      modelId: "known-3",
      action: "U",
      data: { title: "Gone" },
    });
    await frame();
    expect(window.pond.query).toHaveBeenCalledTimes(1);
  });
});
