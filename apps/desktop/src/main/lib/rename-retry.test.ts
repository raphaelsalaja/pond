import { describe, expect, it } from "vitest";
import { renameSyncWithRetry, renameWithRetry } from "./rename-retry";

function busy(code: string) {
  return Object.assign(new Error(code), { code });
}

function flaky(failures: number, code: string) {
  const calls: string[] = [];
  return {
    calls,
    rename(from: string, to: string) {
      calls.push(`${from}>${to}`);
      if (calls.length <= failures) throw busy(code);
    },
  };
}

const sleep = async () => {};

describe("renameWithRetry", () => {
  it("retries transient Windows lock errors", async () => {
    const fs = flaky(2, "EPERM");
    const waits: number[] = [];
    await renameWithRetry("a", "b", {
      rename: async (from, to) => fs.rename(from, to),
      platform: "win32",
      sleep: async (ms) => void waits.push(ms),
    });
    expect(fs.calls).toHaveLength(3);
    expect(waits).toEqual([100, 200]);
  });

  it("gives up after five attempts", async () => {
    const fs = flaky(10, "EBUSY");
    await expect(
      renameWithRetry("a", "b", {
        rename: async (from, to) => fs.rename(from, to),
        platform: "win32",
        sleep,
      }),
    ).rejects.toThrow("EBUSY");
    expect(fs.calls).toHaveLength(5);
  });

  it("does not retry other errors or other platforms", async () => {
    const missing = flaky(10, "ENOENT");
    await expect(
      renameWithRetry("a", "b", {
        rename: async (from, to) => missing.rename(from, to),
        platform: "win32",
        sleep,
      }),
    ).rejects.toThrow("ENOENT");
    const posix = flaky(10, "EPERM");
    await expect(
      renameWithRetry("a", "b", {
        rename: async (from, to) => posix.rename(from, to),
        platform: "darwin",
        sleep,
      }),
    ).rejects.toThrow("EPERM");
    expect(missing.calls).toHaveLength(1);
    expect(posix.calls).toHaveLength(1);
  });
});

describe("renameSyncWithRetry", () => {
  it("retries on win32 only", () => {
    const fs = flaky(2, "EBUSY");
    renameSyncWithRetry("a", "b", {
      rename: fs.rename,
      platform: "win32",
      sleep: () => {},
    });
    expect(fs.calls).toHaveLength(3);

    const mac = flaky(1, "EBUSY");
    expect(() =>
      renameSyncWithRetry("a", "b", {
        rename: mac.rename,
        platform: "darwin",
        sleep: () => {},
      }),
    ).toThrow("EBUSY");
    expect(mac.calls).toHaveLength(1);
  });
});
