import type { CaptureReceipt } from "@pond/schema/capture";
import { describe, expect, it, vi } from "vitest";
import { IPC } from "../shared/constants";
import type { FishOpen } from "../shared/fish-contracts";
import { createFishHandoff } from "./fish-handoff";

function receipt(overrides: Partial<CaptureReceipt> = {}): CaptureReceipt {
  return {
    id: "draft-1",
    library: "/library",
    state: "complete",
    completed: 1,
    total: 1,
    saveIds: ["save-1"],
    duplicateCount: 0,
    ...overrides,
  };
}

function fakeWindow(loading = false) {
  const sent: Array<[string, FishOpen]> = [];
  let onLoad: (() => void) | null = null;
  return {
    sent,
    finishLoad: () => onLoad?.(),
    window: {
      isDestroyed: () => false,
      webContents: {
        isLoading: () => loading,
        send: (channel: string, payload: FishOpen) => {
          sent.push([channel, payload]);
        },
        once: (_: "did-finish-load", listener: () => void) => {
          onLoad = listener;
        },
      },
    },
  };
}

describe("createFishHandoff", () => {
  it("opens the chosen fish with the saves once the capture lands", async () => {
    const win = fakeWindow();
    const activate = vi.fn();
    const handoff = createFishHandoff({
      fishExists: () => true,
      openMainWindow: async () => win.window,
      activate,
    });
    handoff.remember("draft-1", "koi");
    await handoff.complete(receipt());
    expect(activate).toHaveBeenCalledOnce();
    expect(win.sent).toEqual([
      [IPC.fishOpen, { fishId: "koi", saveIds: ["save-1"] }],
    ]);
  });

  it("leaves Pond alone for captures without a fish", async () => {
    const openMainWindow = vi.fn();
    const handoff = createFishHandoff({
      fishExists: () => true,
      openMainWindow,
    });
    await handoff.complete(receipt());
    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it("opens a fish once even if the capture completes again", async () => {
    const win = fakeWindow();
    const handoff = createFishHandoff({
      fishExists: () => true,
      openMainWindow: async () => win.window,
    });
    handoff.remember("draft-1", "koi");
    await handoff.complete(receipt());
    await handoff.complete(receipt());
    expect(win.sent).toHaveLength(1);
  });

  it("skips a fish that was deleted before the save landed", async () => {
    const openMainWindow = vi.fn();
    const handoff = createFishHandoff({
      fishExists: () => false,
      openMainWindow,
    });
    handoff.remember("draft-1", "koi");
    await handoff.complete(receipt());
    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it("skips a capture that produced no saves", async () => {
    const openMainWindow = vi.fn();
    const handoff = createFishHandoff({
      fishExists: () => true,
      openMainWindow,
    });
    handoff.remember("draft-1", "koi");
    await handoff.complete(receipt({ saveIds: [] }));
    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it("waits for a loading window before sending", async () => {
    const win = fakeWindow(true);
    const handoff = createFishHandoff({
      fishExists: () => true,
      openMainWindow: async () => win.window,
    });
    handoff.remember("draft-1", "koi");
    await handoff.complete(receipt());
    expect(win.sent).toEqual([]);
    win.finishLoad();
    expect(win.sent).toHaveLength(1);
  });

  it("forgets a fish after the hand-off window passes", async () => {
    vi.useFakeTimers();
    try {
      const openMainWindow = vi.fn();
      const handoff = createFishHandoff({
        fishExists: () => true,
        openMainWindow,
        ttlMs: 1000,
      });
      handoff.remember("draft-1", "koi");
      vi.advanceTimersByTime(1001);
      await handoff.complete(receipt());
      expect(openMainWindow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
