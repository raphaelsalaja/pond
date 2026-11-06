import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readBundleJson,
  readBundleJsonAsync,
  rotateBundleBackups,
  writeBundleJson,
  writeBundleJsonAsync,
} from "./library-config";

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `pond-bundle-test-${Date.now()}-${Math.random()}`);
  mkdirSync(root, { recursive: true });
});

describe("asynchronous bundle files", () => {
  it("keeps concurrent writes atomic", async () => {
    const file = join(root, "enrichment.json");
    await Promise.all([
      writeBundleJsonAsync(file, { marker: "first" }),
      writeBundleJsonAsync(file, { marker: "second" }),
    ]);
    const read = await readBundleJsonAsync<{ marker: string }>(file);
    expect(["first", "second"]).toContain(read?.data.marker);
    expect(readdirSync(root)).toEqual(["enrichment.json"]);
  });

  it("returns null for missing or corrupt files", async () => {
    const file = join(root, "missing.json");
    expect(await readBundleJsonAsync(file)).toBeNull();
    writeFileSync(file, "not json");
    expect(await readBundleJsonAsync(file)).toBeNull();
  });

  it("does not treat other read errors as missing files", async () => {
    await expect(readBundleJsonAsync(root)).rejects.toMatchObject({
      code: "EISDIR",
    });
  });

  it.skipIf(process.platform === "win32")(
    "runs a timer before a waiting file read completes",
    async () => {
      const file = join(root, "slow.json");
      execFileSync("mkfifo", [file]);
      const writer = spawn(
        process.execPath,
        [
          "-e",
          `const write = () => {
            require("node:fs").writeFileSync(process.argv[1], JSON.stringify({data:{ready:true},updatedAt:1}));
            process.disconnect();
          };
          const fallback = setTimeout(write, 2000);
          process.once("message", () => { clearTimeout(fallback); write(); });`,
          file,
        ],
        { stdio: ["ignore", "ignore", "inherit", "ipc"] },
      );
      const exited = once(writer, "exit");
      let timerRan = false;
      const timer = setTimeout(() => {
        timerRan = true;
        writer.send("write");
      }, 0);
      try {
        expect((await readBundleJsonAsync(file))?.data).toEqual({
          ready: true,
        });
        expect(timerRan).toBe(true);
        expect(await exited).toEqual([0, null]);
      } finally {
        clearTimeout(timer);
        writer.kill();
      }
    },
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("writeBundleJson / readBundleJson", () => {
  it("round-trips data through the versioned envelope", () => {
    const file = join(root, "settings.json");
    writeBundleJson(file, { sync: { sources: { twitter: true } } });
    const read = readBundleJson<{ sync: { sources: Record<string, boolean> } }>(
      file,
    );
    expect(read?.data.sync.sources.twitter).toBe(true);
    expect(read?.updatedAt).toBeGreaterThan(0);
  });

  it("writes portable JSON", () => {
    const file = join(root, "settings.json");

    writeBundleJson(file, { private: "value" });

    expect(JSON.parse(readFileSync(file, "utf8")).data).toEqual({
      private: "value",
    });
  });

  it("returns null for a missing file", () => {
    expect(readBundleJson(join(root, "absent.json"))).toBeNull();
  });

  it("leaves no tmp file behind", () => {
    const file = join(root, "tags.json");
    writeBundleJson(file, { tags: [] });
    expect(readdirSync(root)).toEqual(["tags.json"]);
  });

  it("recovers a corrupt file from the newest parseable backup", () => {
    const file = join(root, "settings.json");
    const backupDir = join(root, "backup");

    writeBundleJson(file, { marker: "good" });
    rotateBundleBackups(backupDir, [file]);

    writeFileSync(file, "{truncated garbage");
    const read = readBundleJson<{ marker: string }>(file, backupDir);
    expect(read?.data.marker).toBe("good");
  });

  it("returns null for a corrupt file with no backups", () => {
    const file = join(root, "settings.json");
    writeFileSync(file, "not json");
    expect(readBundleJson(file, join(root, "backup"))).toBeNull();
  });
});

describe("rotateBundleBackups", () => {
  it("snapshots present files and prunes to the last 10", async () => {
    const file = join(root, "settings.json");
    writeBundleJson(file, { n: 0 });
    const backupDir = join(root, "backup");

    for (let i = 0; i < 12; i++) {
      rotateBundleBackups(backupDir, [file, join(root, "missing.json")]);
      await new Promise((r) => setTimeout(r, 2));
    }

    const dirs = readdirSync(backupDir);
    expect(dirs.length).toBeLessThanOrEqual(10);
    for (const dir of dirs) {
      expect(existsSync(join(backupDir, dir, "settings.json"))).toBe(true);
      expect(existsSync(join(backupDir, dir, "missing.json"))).toBe(false);
    }
  });

  it("does nothing when no source files exist", () => {
    const backupDir = join(root, "backup");
    rotateBundleBackups(backupDir, [join(root, "missing.json")]);
    expect(existsSync(backupDir)).toBe(false);
  });
});
