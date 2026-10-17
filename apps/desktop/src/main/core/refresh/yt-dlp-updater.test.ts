import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { YTDLP_FILENAME } from "./binaries";
import {
  recoverFiles,
  renameWithRetry,
  runUpdate,
  type UpdaterDeps,
  ytDlpAsset,
} from "./yt-dlp-updater";

function busy(code: string) {
  return Object.assign(new Error(code), { code });
}

function flakyRename(failures: number, code: string) {
  const calls: string[] = [];
  return {
    calls,
    async rename(from: string, to: string) {
      calls.push(`${from}>${to}`);
      if (calls.length <= failures) throw busy(code);
    },
  };
}

const sleep = async () => {};

describe("renameWithRetry", () => {
  it("retries transient Windows lock errors until the rename succeeds", async () => {
    const fs = flakyRename(2, "EBUSY");
    await renameWithRetry("a", "b", {
      rename: fs.rename,
      platform: "win32",
      sleep,
    });
    expect(fs.calls).toHaveLength(3);
  });

  it("gives up after five attempts", async () => {
    const fs = flakyRename(10, "EPERM");
    await expect(
      renameWithRetry("a", "b", {
        rename: fs.rename,
        platform: "win32",
        sleep,
      }),
    ).rejects.toThrow("EPERM");
    expect(fs.calls).toHaveLength(5);
  });

  it("does not retry other errors or other platforms", async () => {
    const missing = flakyRename(10, "ENOENT");
    await expect(
      renameWithRetry("a", "b", {
        rename: missing.rename,
        platform: "win32",
        sleep,
      }),
    ).rejects.toThrow("ENOENT");
    expect(missing.calls).toHaveLength(1);

    const posix = flakyRename(10, "EBUSY");
    await expect(
      renameWithRetry("a", "b", {
        rename: posix.rename,
        platform: "linux",
        sleep,
      }),
    ).rejects.toThrow("EBUSY");
    expect(posix.calls).toHaveLength(1);
  });
});

describe("ytDlpAsset", () => {
  const cases: Array<[NodeJS.Platform, string, string | undefined]> = [
    ["win32", "x64", "yt-dlp.exe"],
    ["win32", "arm64", "yt-dlp_arm64.exe"],
    ["win32", "ia32", undefined],
    ["darwin", "arm64", "yt-dlp_macos"],
    ["darwin", "x64", "yt-dlp_macos"],
    ["linux", "x64", "yt-dlp_linux"],
    ["freebsd", "x64", undefined],
  ];
  it.each(cases)("%s %s -> %s", (platform, arch, expected) => {
    expect(ytDlpAsset(platform, arch)).toBe(expected);
  });
});

describe("yt-dlp update lifecycle", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const active = () => join(dir, YTDLP_FILENAME);
  const previous = () => join(dir, `${YTDLP_FILENAME}.previous`);
  const text = (path: string) => readFile(path, "utf8").catch(() => null);

  /** A stand-in binary runs when its content starts with "good". */
  const smokeTest = async (path: string) =>
    ((await text(path)) ?? "").startsWith("good");

  function offlineDeps(rename_: UpdaterDeps["rename"] = rename): UpdaterDeps {
    return {
      dir,
      asset: "yt-dlp.exe",
      rename: rename_,
      smokeTest,
      fetchLatestTag: async () => {
        throw new Error("offline");
      },
      fetchExpectedSha: async () => null,
      fetchBinary: async () => {
        throw new Error("offline");
      },
    };
  }

  function onlineDeps(rename_: UpdaterDeps["rename"] = rename): UpdaterDeps {
    const body = Buffer.from("good v2");
    return {
      ...offlineDeps(rename_),
      fetchLatestTag: async () => "v2",
      fetchExpectedSha: async () =>
        createHash("sha256").update(body).digest("hex"),
      fetchBinary: async () => body,
    };
  }

  /** Every rename from the nth (1-based) on fails, like a process that died at that step. */
  function failingRename(nth: number) {
    let calls = 0;
    return async (from: string, to: string) => {
      calls++;
      if (calls >= nth) throw Object.assign(new Error("EIO"), { code: "EIO" });
      await rename(from, to);
    };
  }

  async function installV1() {
    await mkdir(dir, { recursive: true });
    await writeFile(active(), "good v1");
    await writeFile(join(dir, ".yt-dlp-version"), "v1");
  }

  it("updates, keeping the old binary as the rollback backup", async () => {
    await installV1();
    await runUpdate(onlineDeps(), true);
    expect(await text(active())).toBe("good v2");
    expect(await text(previous())).toBe("good v1");
    expect(await text(join(dir, ".yt-dlp-version"))).toBe("v2");
  });

  it("recovers offline when the update dies after the active binary was rotated away", async () => {
    await installV1();
    await runUpdate(onlineDeps(failingRename(2)), true);
    expect(existsSync(active())).toBe(false);
    expect(await text(previous())).toBe("good v1");

    await recoverFiles(offlineDeps());
    expect(await text(active())).toBe("good v1");
    expect(existsSync(previous())).toBe(false);
    expect(await text(join(dir, ".yt-dlp-version"))).toBe("v1");
  });

  it("leaves the active binary untouched when the update dies during rotation", async () => {
    await installV1();
    await runUpdate(onlineDeps(failingRename(1)), true);
    await recoverFiles(offlineDeps());
    expect(await text(active())).toBe("good v1");
    expect(await text(join(dir, ".yt-dlp-version"))).toBe("v1");
  });

  it("keeps a healthy promoted binary when the process dies after promotion", async () => {
    await installV1();
    await runUpdate(onlineDeps(), true);
    // Died after promotion, before the version file was written.
    await rm(join(dir, ".yt-dlp-version"), { force: true });
    await recoverFiles(offlineDeps());
    expect(await text(active())).toBe("good v2");
    expect(await text(previous())).toBe("good v1");
  });

  it("rolls back offline when the promoted binary is broken", async () => {
    await installV1();
    await runUpdate(onlineDeps(), true);
    await writeFile(active(), "corrupt");
    await recoverFiles(offlineDeps());
    expect(await text(active())).toBe("good v1");
    expect(await text(join(dir, ".yt-dlp-version"))).toBe("v1");
  });

  it("does not restore a backup that cannot run", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(previous(), "corrupt");
    await recoverFiles(offlineDeps());
    expect(existsSync(active())).toBe(false);
    expect(await text(previous())).toBe("corrupt");
  });

  it("sweeps stale download files but leaves unrelated and backup files alone", async () => {
    await installV1();
    await writeFile(join(dir, `${YTDLP_FILENAME}.4242.tmp`), "partial");
    await writeFile(join(dir, "ffmpeg.123.tmp"), "other");
    await writeFile(previous(), "good v0");
    await recoverFiles(offlineDeps());
    expect((await readdir(dir)).sort()).toEqual(
      [
        ".yt-dlp-version",
        "ffmpeg.123.tmp",
        YTDLP_FILENAME,
        `${YTDLP_FILENAME}.previous`,
      ].sort(),
    );
  });

  it("is a no-op when nothing is installed", async () => {
    await recoverFiles(offlineDeps());
    expect(existsSync(active())).toBe(false);
  });
});
