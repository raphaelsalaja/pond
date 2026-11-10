import { expect, it } from "vitest";
import { runsQueueWorkerInProcess } from "./worker-mode";

it("runs image work in process on Linux Electron only", () => {
  expect(runsQueueWorkerInProcess("linux", "44.4.0")).toBe(true);
  expect(runsQueueWorkerInProcess("linux", undefined)).toBe(false);
  expect(runsQueueWorkerInProcess("darwin", "44.4.0")).toBe(false);
  expect(runsQueueWorkerInProcess("win32", "44.4.0")).toBe(false);
});
