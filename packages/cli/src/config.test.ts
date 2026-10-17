import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configPath, configReadPaths, readConfig, writeConfig } from "./config";

describe("CLI config", () => {
  it("writes scoped credentials and applies owner-only POSIX permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pond-cli-"));
    const path = join(directory, "config.json");
    try {
      await writeConfig({ token: "secret" }, path);
      await expect(readConfig(path)).resolves.toEqual({ token: "secret" });
      // Windows reports synthetic POSIX mode bits; access is governed by the
      // inherited ACL of the user's private configuration directory.
      if (process.platform !== "win32")
        expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("CLI config location", () => {
  it("uses the APPDATA Pond folder on Windows and reads the old XDG file as a fallback", () => {
    const env = { APPDATA: "C:/Users/a/AppData/Roaming", XDG_CONFIG_HOME: "X" };
    expect(configPath(env, "win32")).toBe(
      join(env.APPDATA, "Pond", "cli.json"),
    );
    expect(configReadPaths(env, "win32")).toEqual([
      join(env.APPDATA, "Pond", "cli.json"),
      join("X", "pond", "cli.json"),
    ]);
  });

  it("keeps the macOS, Linux and explicit locations unchanged", () => {
    expect(configPath({ XDG_CONFIG_HOME: "X" }, "linux")).toBe(
      join("X", "pond", "cli.json"),
    );
    expect(configReadPaths({ XDG_CONFIG_HOME: "X" }, "linux")).toEqual([
      join("X", "pond", "cli.json"),
    ]);
    expect(configReadPaths({ POND_CONFIG: "c.json" }, "win32")).toEqual([
      "c.json",
    ]);
  });

  it("migrates by reading the legacy file until a new one is written", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pond-cli-"));
    try {
      const env = {
        APPDATA: join(directory, "roaming"),
        XDG_CONFIG_HOME: join(directory, "xdg"),
      };
      await mkdir(join(directory, "xdg", "pond"), { recursive: true });
      await writeFile(
        join(directory, "xdg", "pond", "cli.json"),
        JSON.stringify({ token: "old" }),
      );
      await expect(readConfig(undefined, env, "win32")).resolves.toEqual({
        token: "old",
      });
      await writeConfig({ token: "new" }, configPath(env, "win32"));
      await expect(readConfig(undefined, env, "win32")).resolves.toEqual({
        token: "new",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
