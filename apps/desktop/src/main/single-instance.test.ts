import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  acquireSingleInstanceLock,
  isProcessAlive,
  singletonLockHolder,
} from "./single-instance";
import { isWindowsSymlinkPrivilegeError } from "./test/symlink";

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

function lockPort(exitsAfterPolls: number | null) {
  let polls = 0;
  let requests = 0;
  const clock = fakeClock();
  return {
    port: {
      request: () => {
        requests += 1;
        return true;
      },
      holder: () => 4242,
      isAlive: () => exitsAfterPolls === null || polls < exitsAfterPolls,
      pid: 1,
      now: clock.now,
      sleep: async (ms: number) => {
        polls += 1;
        await clock.sleep(ms);
      },
    },
    polls: () => polls,
    requests: () => requests,
  };
}

it("requests the lock once after the predecessor exits", async () => {
  const lock = lockPort(3);
  await expect(
    acquireSingleInstanceLock({ ...lock.port, waitForPredecessor: true }),
  ).resolves.toBe(true);
  expect(lock.polls()).toBe(3);
  expect(lock.requests()).toBe(1);
});

it("does not wait for a running instance in a packaged app", async () => {
  const lock = lockPort(null);
  await acquireSingleInstanceLock({ ...lock.port, waitForPredecessor: false });
  expect(lock.polls()).toBe(0);
  expect(lock.requests()).toBe(1);
});

it("stops waiting for a predecessor that never exits", async () => {
  const lock = lockPort(null);
  await acquireSingleInstanceLock({ ...lock.port, waitForPredecessor: true });
  expect(lock.polls()).toBe(200);
  expect(lock.requests()).toBe(1);
});

it("does not wait on its own stale lock", async () => {
  const lock = lockPort(null);
  await acquireSingleInstanceLock({
    ...lock.port,
    pid: 4242,
    waitForPredecessor: true,
  });
  expect(lock.polls()).toBe(0);
});

it("reads the holder pid from Chromium's lock link", async (ctx) => {
  const dir = await mkdtemp(join(tmpdir(), "pond-lock-"));
  try {
    expect(singletonLockHolder(dir)).toBeNull();
    try {
      await symlink(
        "Raphaels-MacBook-Pro.local-44592",
        join(dir, "SingletonLock"),
      );
    } catch (error) {
      if (error instanceof Error && isWindowsSymlinkPrivilegeError(error)) {
        ctx.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    expect(singletonLockHolder(dir)).toBe(44592);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("reports whether a process is running", () => {
  expect(isProcessAlive(process.pid)).toBe(true);
  expect(isProcessAlive(2 ** 22 + 1)).toBe(false);
});
