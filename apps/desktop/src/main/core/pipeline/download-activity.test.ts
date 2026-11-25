import { describe, expect, it } from "vitest";
import { createDownloadActivityStore } from "./download-activity";

describe("download activity", () => {
  it("settles tasks and ignores late callbacks from timed-out workers", () => {
    const store = createDownloadActivityStore();
    const task = store.begin({ id: "a", saveId: "save", op: "fetch_blobs" });
    task.report({
      phase: "receiving",
      transfer: {
        fileIndex: 1,
        state: "receiving",
        startedAt: 1,
        updatedAt: 2,
        receivedBytes: 5,
        bytesPerSecond: 10,
      },
    });
    task.finish("failed");
    task.report({ phase: "receiving" });
    expect(store.snapshot()[0]).toMatchObject({
      state: "failed",
      phase: "failed",
      transfers: [{ state: "failed", bytesPerSecond: undefined }],
    });
    const retry = store.begin({ id: "a", saveId: "save", op: "fetch_blobs" });
    task.report({ phase: "saving" });
    expect(store.snapshot()[0]?.state).toBe("running");
    retry.finish("completed");
    expect(store.snapshot()[0]?.state).toBe("completed");
  });

  it("keeps active transfers visible while sibling files finish", () => {
    const store = createDownloadActivityStore();
    const task = store.begin({ id: "a", saveId: "save", op: "fetch_blobs" });
    task.report({
      phase: "receiving",
      transfer: {
        fileIndex: 1,
        state: "receiving",
        startedAt: 1,
        updatedAt: 2,
      },
    });
    task.report({
      phase: "processing",
      transfer: {
        fileIndex: 2,
        state: "completed",
        startedAt: 1,
        updatedAt: 3,
      },
    });
    expect(store.snapshot()[0]?.phase).toBe("receiving");
    task.report({
      phase: "processing",
      transfer: {
        fileIndex: 1,
        state: "completed",
        startedAt: 1,
        updatedAt: 4,
      },
    });
    expect(store.snapshot()[0]?.phase).toBe("processing");
  });

  it("bounds recent history without evicting active work or exposing mutable snapshots", () => {
    const store = createDownloadActivityStore(2);
    store.begin({ id: "active", saveId: "save", op: "finalize" });
    for (let i = 0; i < 5; i++) {
      const task = store.begin({
        id: String(i),
        saveId: "save",
        op: "fetch_blobs",
      });
      for (let j = 0; j < 100; j++) {
        task.report({ phase: j % 2 ? "receiving" : "processing" });
      }
      task.finish("completed");
    }
    const snapshot = store.snapshot();
    expect(snapshot).toHaveLength(3);
    expect(snapshot.find((entry) => entry.taskId === "active")?.state).toBe(
      "running",
    );
    expect(snapshot.every((entry) => entry.timeline.length <= 32)).toBe(true);
    snapshot.splice(0);
    expect(store.snapshot()).toHaveLength(3);
  });
  it("ages transfer speed by received bytes instead of repeated progress messages", () => {
    let clock = 1000;
    const store = createDownloadActivityStore(100, () => clock);
    const task = store.begin({ id: "a", saveId: "save", op: "fetch_blobs" });
    const transfer = {
      fileIndex: 1,
      state: "receiving" as const,
      startedAt: 1000,
      updatedAt: 1000,
      receivedBytes: 50,
      bytesPerSecond: 10,
      etaSeconds: 5,
    };
    task.report({ phase: "receiving", transfer });
    clock = 4000;
    task.report({
      phase: "receiving",
      transfer: { ...transfer, updatedAt: clock },
    });
    expect(store.snapshot()[0]?.transfers[0]).toMatchObject({
      lastByteAt: 1000,
      bytesPerSecond: 0,
      etaSeconds: undefined,
    });
    task.report({
      phase: "receiving",
      transfer: { ...transfer, updatedAt: clock, receivedBytes: 100 },
    });
    expect(store.snapshot()[0]?.transfers[0]).toMatchObject({
      lastByteAt: 4000,
      bytesPerSecond: 10,
    });
  });

  it("drops old library activity and ignores its in-flight callbacks", () => {
    const store = createDownloadActivityStore();
    const old = store.begin({
      id: "same",
      saveId: "old-library",
      op: "fetch_blobs",
    });
    store.reset();
    store.begin({ id: "same", saveId: "new-library", op: "fetch_blobs" });
    old.report({ phase: "receiving" });
    old.finish("failed");
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({
      saveId: "new-library",
      state: "running",
      phase: "starting",
    });
  });

  it("keeps the latest active file when a task has more than 64 transfers", () => {
    const store = createDownloadActivityStore();
    const task = store.begin({ id: "a", saveId: "save", op: "fetch_blobs" });
    for (let fileIndex = 1; fileIndex <= 64; fileIndex++) {
      task.report({
        phase: "processing",
        transfer: { fileIndex, state: "completed", startedAt: 1, updatedAt: 2 },
      });
    }
    task.report({
      phase: "receiving",
      transfer: {
        fileIndex: 65,
        state: "receiving",
        startedAt: 3,
        updatedAt: 4,
      },
    });
    const snapshot = store.snapshot()[0];
    expect(snapshot?.transfers).toHaveLength(64);
    expect(snapshot?.transfers.at(-1)?.fileIndex).toBe(65);
    expect(snapshot?.phase).toBe("receiving");
  });
  it("detects a transfer still receiving no bytes despite repeated progress output", () => {
    let clock = 1000;
    const store = createDownloadActivityStore(100, () => clock);
    const task = store.begin({
      id: "a",
      saveId: "save",
      op: "fetch_video_ytdlp",
    });
    clock = 4000;
    task.report({
      phase: "receiving",
      transfer: {
        fileIndex: 1,
        state: "receiving",
        startedAt: 1000,
        updatedAt: clock,
        receivedBytes: 0,
        bytesPerSecond: 100,
        etaSeconds: 10,
      },
    });
    expect(store.snapshot()[0]?.transfers[0]).toMatchObject({
      lastByteAt: undefined,
      bytesPerSecond: 0,
      etaSeconds: undefined,
    });
  });
});
