import { describe, expect, it } from "vitest";
import { openAppInstance } from "./open-app-instance";
import type { SpawnOpenProcess } from "./open-app-instance";

const failingSpawn: SpawnOpenProcess = () => ({
  unref: () => {},
  once: (_event, listener) => {
    listener(new Error("spawn failed"));
  },
});

describe("openAppInstance", () => {
  it("opens a new instance of the bundle that contains the executable", () => {
    let spawned: Parameters<SpawnOpenProcess> | null = null;
    let unrefCalls = 0;
    const spawnProcess: SpawnOpenProcess = (...params) => {
      spawned = params;
      return {
        unref: () => {
          unrefCalls += 1;
        },
        once: () => {},
      };
    };

    openAppInstance({
      execPath: "/Applications/Pond.app/Contents/MacOS/Pond",
      spawnProcess,
      onError: () => {},
    });

    expect(spawned).toEqual([
      "open",
      ["-n", "/Applications/Pond.app"],
      { detached: true, stdio: "ignore" },
    ]);
    expect(unrefCalls).toBe(1);
  });

  it("reports a spawn failure to the caller", () => {
    let reported: Error | null = null;

    openAppInstance({
      execPath: "/Applications/Pond.app/Contents/MacOS/Pond",
      spawnProcess: failingSpawn,
      onError: (error) => {
        reported = error;
      },
    });

    expect(reported).toEqual(new Error("spawn failed"));
  });
});
