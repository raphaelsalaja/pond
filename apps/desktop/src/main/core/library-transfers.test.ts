import { afterEach, expect, it } from "vitest";
import {
  resumeLibraryTransfers,
  runLibraryTransfer,
  stopLibraryTransfers,
} from "./library-transfers";

function noop(): void {}

afterEach(() => resumeLibraryTransfers());
it("drains an active transfer and blocks new transfers while the library changes", async () => {
  let release: () => void = noop;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finished = false;
  const transfer = runLibraryTransfer(async () => {
    await pending;
    finished = true;
  });
  const stopped = stopLibraryTransfers();
  expect(finished).toBe(false);
  await expect(runLibraryTransfer(async () => {})).rejects.toThrow(
    "library is changing",
  );
  release();
  await stopped;
  await transfer;
  expect(finished).toBe(true);
  resumeLibraryTransfers();
  await expect(runLibraryTransfer(async () => 1)).resolves.toBe(1);
});
it("allows an admitted transfer to finish its nested export while draining", async () => {
  let release: () => void = noop;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transfer = runLibraryTransfer(async () => {
    await pending;
    return runLibraryTransfer(async () => "complete");
  });
  const stopped = stopLibraryTransfers();
  release();
  await expect(transfer).resolves.toBe("complete");
  await stopped;
});

it("does not let deferred callbacks reuse admission after their transfer ends", async () => {
  let release: () => void = noop;
  const later = new Promise<void>((resolve) => {
    release = resolve;
  });
  let deferred: Promise<unknown> = Promise.resolve();
  await runLibraryTransfer(async () => {
    deferred = later.then(() => runLibraryTransfer(async () => "unexpected"));
  });
  await stopLibraryTransfers();
  release();
  await expect(deferred).rejects.toThrow("library is changing");
});
