import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { type McpHostLoss, watchMcpHost } from "./mcp-host";

function harness(initialParent = 42) {
  const stdin = new EventEmitter();
  let parent = initialParent;
  let tick: (() => void) | null = null;
  let cancelled = false;
  const lost: McpHostLoss[] = [];
  const stop = watchMcpHost({
    stdin,
    parentPid: () => parent,
    onLost: (reason) => lost.push(reason),
    every: (run) => {
      tick = run;
      return () => {
        cancelled = true;
      };
    },
  });
  return {
    stdin,
    lost,
    stop,
    reparent: (pid: number) => {
      parent = pid;
    },
    poll: () => tick?.(),
    cancelled: () => cancelled,
  };
}

describe("watchMcpHost", () => {
  it("reports the host lost when stdin ends", () => {
    const h = harness();
    h.stdin.emit("end");
    expect(h.lost).toEqual(["stdin-closed"]);
    expect(h.cancelled()).toBe(true);
  });

  it("reports the host lost once when stdin ends and closes", () => {
    const h = harness();
    h.stdin.emit("end");
    h.stdin.emit("close");
    expect(h.lost).toEqual(["stdin-closed"]);
    expect(h.stdin.listenerCount("end")).toBe(0);
    expect(h.stdin.listenerCount("close")).toBe(0);
  });

  it("reports the host lost when the process is reparented", () => {
    const h = harness();
    h.poll();
    expect(h.lost).toEqual([]);
    h.reparent(1);
    h.poll();
    expect(h.lost).toEqual(["parent-exited"]);
  });

  it("stops watching without reporting a loss", () => {
    const h = harness();
    h.stop();
    h.stdin.emit("end");
    h.reparent(1);
    h.poll();
    expect(h.lost).toEqual([]);
    expect(h.cancelled()).toBe(true);
  });
});
