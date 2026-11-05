import { describe, expect, it } from "vitest";
import { runUpdateRestart } from "./update-restart";

describe("update restart", () => {
  it("finishes shutdown and releases the caller before quitAndInstall", async () => {
    const events: string[] = [];
    let finishShutdown: () => void = () => {};
    const shutdown = new Promise<void>((resolve) => {
      finishShutdown = () => {
        events.push("shutdown");
        resolve();
      };
    });

    const pending = runUpdateRestart({
      armWatchdog: () => events.push("watchdog"),
      prepare: () => shutdown,
      schedule: (task) => {
        events.push("scheduled");
        setImmediate(task);
      },
      quitAndInstall: () => events.push("install"),
    });
    events.push("clicked");

    await Promise.resolve();
    expect(events).toEqual(["watchdog", "clicked"]);

    finishShutdown();
    await pending;
    events.push("replied");
    expect(events).toEqual([
      "watchdog",
      "clicked",
      "shutdown",
      "scheduled",
      "replied",
    ]);

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(events).toEqual([
      "watchdog",
      "clicked",
      "shutdown",
      "scheduled",
      "replied",
      "install",
    ]);
  });
});
