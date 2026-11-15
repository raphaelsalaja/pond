import { describe, expect, it } from "vitest";
import { openAppInstance, type SpawnOpenProcess } from "./open-app-instance";

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
    const spawnProcess: SpawnOpenProcess = () => ({
      unref: () => {},
      once: (_event, listener) => {
        listener(new Error("spawn failed"));
      },
    });

    openAppInstance({
      execPath: "/Applications/Pond.app/Contents/MacOS/Pond",
      spawnProcess,
      onError: (error) => {
        reported = error;
      },
    });

    expect(reported).toEqual(new Error("spawn failed"));
  });
});
