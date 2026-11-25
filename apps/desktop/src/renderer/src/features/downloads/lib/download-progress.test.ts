import type { DownloadActivity } from "@shared/download-activity";
import { describe, expect, it } from "vitest";
import {
  describeDownloadActivity,
  downloadActivityForSave,
} from "./download-progress";

function activity(overrides: Partial<DownloadActivity> = {}): DownloadActivity {
  return {
    taskId: "task",
    saveId: "save",
    op: "fetch_blobs",
    state: "running",
    startedAt: 1000,
    updatedAt: 2000,
    phase: "receiving",
    phaseStartedAt: 1500,
    transfers: [
      {
        fileIndex: 1,
        fileCount: 3,
        state: "receiving",
        startedAt: 1000,
        updatedAt: 2000,
        receivedBytes: 38_400_000,
        totalBytes: 120_000_000,
        bytesPerSecond: 4_200_000,
      },
    ],
    timeline: [],
    ...overrides,
  };
}
describe("download activity presentation", () => {
  it("uses measured bytes, labels per-file progress, and hides stale rates", () => {
    const current = activity();
    expect(describeDownloadActivity(current, 2000)).toMatchObject({
      progress: 0.32,
      speed: "4.01 MiB/s",
      detail: "File 1 of 3",
      stalled: false,
    });
    expect(describeDownloadActivity(current, 18_000)).toMatchObject({
      progress: 0.32,
      speed: null,
      detail: "No data received for 0:16",
      stalled: true,
    });
  });
  it("does not reuse a completed transfer as processing progress", () => {
    expect(
      describeDownloadActivity(activity({ phase: "processing" }), 3000),
    ).toMatchObject({
      label: "Processing media",
      progress: null,
      speed: null,
      stalled: false,
    });
  });
  it("names a source cooldown wait without calling it paused", () => {
    expect(
      describeDownloadActivity(activity({ phase: "waiting" }), 3000),
    ).toMatchObject({
      label: "Waiting on source",
      progress: null,
      stalled: false,
    });
  });
  it("leaves unknown sizes and server waits indeterminate", () => {
    const current = activity({
      phase: "requesting",
      transfers: [
        {
          fileIndex: 1,
          state: "requesting",
          startedAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    expect(describeDownloadActivity(current, 17_000)).toMatchObject({
      progress: null,
      detail: "No response for 0:16",
      speed: null,
    });
    current.phase = "receiving";
    current.transfers[0] = {
      fileIndex: 1,
      state: "receiving",
      startedAt: 1000,
      updatedAt: 2000,
      receivedBytes: 3000,
    };
    expect(describeDownloadActivity(current, 2000).progress).toBeNull();
  });
  it("identifies concurrent active files without pretending to measure the whole save", () => {
    const current = activity();
    current.transfers.push({
      fileIndex: 2,
      state: "requesting",
      startedAt: 1800,
      updatedAt: 1800,
    });
    expect(describeDownloadActivity(current, 2000).detail).toBe(
      "2 files active",
    );
  });
  it("prefers running tasks over newer completed tasks of the same save", () => {
    const running = activity();
    const completed = activity({
      taskId: "other",
      state: "completed",
      updatedAt: 3000,
    });
    expect(downloadActivityForSave([completed, running], "save")).toBe(running);
    expect(downloadActivityForSave([running, completed], "save")).toBe(running);
    expect(downloadActivityForSave([running], "missing")).toBeUndefined();
  });
});
