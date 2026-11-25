import type { UpdateNotice } from "@shared/update-notice";
import { describe, expect, it, vi } from "vitest";
import { runUpdateAction, subscribeToUpdateNotices } from ".";

describe("runUpdateAction", () => {
  it("resolves null when the action succeeds", async () => {
    const ran: Array<string> = [];
    await expect(
      runUpdateAction("updates.download", async (name) => {
        ran.push(name);
        return { ok: true };
      }),
    ).resolves.toBeNull();
    expect(ran).toEqual(["updates.download"]);
  });

  it("surfaces the main-process error", async () => {
    await expect(
      runUpdateAction("updates.download", async () => ({
        ok: false,
        error: "Network unavailable",
      })),
    ).resolves.toBe("Network unavailable");
  });

  it("explains development builds", async () => {
    await expect(
      runUpdateAction("updates.install", async () => ({
        ok: false,
        reason: "dev_build",
      })),
    ).resolves.toBe("Updates aren't available in development builds.");
  });

  it("falls back to an action-specific message", async () => {
    await expect(
      runUpdateAction("updates.install", async () => {
        throw "boom";
      }),
    ).resolves.toBe("Couldn't restart Pond. Try again.");
  });
});

describe("subscribeToUpdateNotices", () => {
  it("presents a cached notice when no event is emitted", async () => {
    const notice = {
      phase: "downloaded" as const,
      version: "1.0.2",
    };
    const presented = Promise.withResolvers<UpdateNotice>();
    const stop = subscribeToUpdateNotices(presented.resolve, {
      current: async () => notice,
      subscribe: () => vi.fn(),
      warn: vi.fn(),
    });

    expect(await presented.promise).toEqual(notice);
    stop();
  });

  it("pulls a cached notice after subscribing and deduplicates the event race", async () => {
    const notice = {
      phase: "downloaded" as const,
      version: "1.0.2",
    };
    let listener: ((value: typeof notice) => void) | undefined;
    const present = vi.fn();
    const unsubscribe = vi.fn();
    const current = Promise.withResolvers<UpdateNotice | null>();
    const stop = subscribeToUpdateNotices(present, {
      current: () => current.promise,
      subscribe: (next) => {
        listener = next;
        return unsubscribe;
      },
      warn: vi.fn(),
    });

    listener?.(notice);
    current.resolve(notice);
    await current.promise;
    expect(present).toHaveBeenCalledTimes(1);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
