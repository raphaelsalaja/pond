import assert from "node:assert/strict";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { acquireDevRuntime, releaseDevRuntime } from "./run-dev-singleton.mjs";

const testDirectories = [];

async function createTestLockDirectory(name) {
  const directory = join(
    tmpdir(),
    `pond-dev-runtime-${name}-${process.pid}-${Date.now()}`,
  );
  testDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    testDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

void test("reports an active runtime instead of acquiring a second lock", async () => {
  const lockDirectory = await createTestLockDirectory("active");
  const first = await acquireDevRuntime({
    command: ["pnpm", "dev"],
    cwd: process.cwd(),
    lockDirectory,
  });
  assert.equal(first.status, "acquired");

  const second = await acquireDevRuntime({
    command: ["pnpm", "dev:desktop"],
    cwd: process.cwd(),
    lockDirectory,
  });
  assert.equal(second.status, "running");
  assert.deepEqual(second.owner.command, ["pnpm", "dev"]);

  assert.equal(await releaseDevRuntime(first), true);
  await assert.rejects(access(lockDirectory));
});

void test("recovers a lock whose owner is no longer running", async () => {
  const lockDirectory = await createTestLockDirectory("stale");
  await mkdir(lockDirectory);
  await writeFile(
    join(lockDirectory, "owner.json"),
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: "stale-owner",
      cwd: process.cwd(),
      command: ["pnpm", "dev"],
      startedAt: new Date(0).toISOString(),
    })}\n`,
    "utf8",
  );

  const acquisition = await acquireDevRuntime({
    command: ["pnpm", "dev:desktop"],
    cwd: process.cwd(),
    lockDirectory,
  });
  assert.equal(acquisition.status, "acquired");
  assert.deepEqual(acquisition.owner.command, ["pnpm", "dev:desktop"]);
  await releaseDevRuntime(acquisition);
});

void test("does not remove a lock that is still being initialized", async () => {
  const lockDirectory = await createTestLockDirectory("initializing");
  await mkdir(lockDirectory);

  const acquisition = await acquireDevRuntime({
    command: ["pnpm", "dev"],
    cwd: process.cwd(),
    lockDirectory,
  });
  assert.equal(acquisition.status, "running");
  assert.equal(acquisition.owner, null);
});
