import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  appRelaunchEnv,
  appRelaunchOptions,
  planRelaunch,
  RELAUNCH_ARG,
  relaunchCommand,
  type SpawnRelaunchProcess,
  spawnRelaunch,
} from "./relaunch";

describe("appRelaunchOptions", () => {
  it("relaunches Linux AppImages from the stable AppImage path", () => {
    expect(
      appRelaunchOptions("linux", "/home/user/Pond.AppImage", [
        "/tmp/.mount-Pond/pond",
        "--hidden",
      ]),
    ).toEqual({
      execPath: "/home/user/Pond.AppImage",
      args: ["--hidden", RELAUNCH_ARG],
    });
  });

  it("uses Electron's default executable outside Linux AppImages", () => {
    expect(
      appRelaunchOptions("linux", undefined, ["/usr/bin/pond"]),
    ).toBeUndefined();
    expect(
      appRelaunchOptions("darwin", "/Applications/Pond.app", [
        "/Applications/Pond.app/Contents/MacOS/Pond",
      ]),
    ).toBeUndefined();
  });

  it("does not duplicate the relaunch marker", () => {
    expect(
      appRelaunchOptions("linux", "/home/user/Pond.AppImage", [
        "/tmp/.mount-Pond/pond",
        RELAUNCH_ARG,
      ]),
    ).toEqual({
      execPath: "/home/user/Pond.AppImage",
      args: [RELAUNCH_ARG],
    });
  });
});

describe("planRelaunch", () => {
  it("spawns the installed AppImage instead of Electron's relaunch", () => {
    expect(
      planRelaunch(
        "linux",
        "/home/user/Pond.AppImage",
        ["/tmp/.mount-Pond/pond", "--hidden"],
        {
          HOME: "/home/user",
          APPIMAGE: "/home/user/Pond.AppImage",
          APPDIR: "/tmp/.mount-Pond",
          ARGV0: "/tmp/.mount-Pond/pond",
          OWD: "/home/user",
        },
      ),
    ).toEqual({
      kind: "spawn",
      command: "/home/user/Pond.AppImage",
      args: ["--hidden", RELAUNCH_ARG],
      env: { HOME: "/home/user" },
    });
  });

  it("leaves the relaunch to Electron outside Linux AppImages", () => {
    expect(
      planRelaunch("linux", undefined, ["/usr/bin/pond"], {
        HOME: "/home/user",
      }),
    ).toEqual({ kind: "electron" });
    expect(
      planRelaunch(
        "darwin",
        "/Applications/Pond.app",
        ["/Applications/Pond.app/Contents/MacOS/Pond"],
        { HOME: "/Users/user" },
      ),
    ).toEqual({ kind: "electron" });
  });
});

describe("appRelaunchEnv", () => {
  it("drops the old mount without changing the caller's environment", () => {
    const env = {
      HOME: "/home/user",
      APPIMAGE: "/home/user/Pond.AppImage",
      APPDIR: "/tmp/.mount-Pond",
      ARGV0: "/tmp/.mount-Pond/pond",
      OWD: "/home/user",
    };

    expect(appRelaunchEnv(env)).toEqual({ HOME: "/home/user" });
    expect(env).toEqual({
      HOME: "/home/user",
      APPIMAGE: "/home/user/Pond.AppImage",
      APPDIR: "/tmp/.mount-Pond",
      ARGV0: "/tmp/.mount-Pond/pond",
      OWD: "/home/user",
    });
  });
});

describe("spawnRelaunch", () => {
  it("detaches the replacement with a cleaned environment and closed descriptors", () => {
    let spawned: Parameters<SpawnRelaunchProcess> | null = null;
    let unrefCalls = 0;
    let errorListener: ((error: Error) => void) | null = null;
    const spawnProcess: SpawnRelaunchProcess = (...params) => {
      spawned = params;
      return {
        unref: () => {
          unrefCalls += 1;
        },
        once: (_event, listener) => {
          errorListener = listener;
        },
      };
    };

    spawnRelaunch(
      {
        command: "/home/user/Pond.AppImage",
        args: ["--hidden"],
        env: { HOME: "/home/user" },
      },
      { spawnProcess, onError: () => {} },
    );

    expect(spawned).toEqual([
      "bash",
      [
        "-c",
        expect.stringContaining("/proc/self/fd"),
        "/home/user/Pond.AppImage",
        "--hidden",
      ],
      {
        detached: true,
        stdio: "ignore",
        env: { HOME: "/home/user" },
      },
    ]);
    expect(unrefCalls).toBe(1);
    expect(errorListener).not.toBeNull();
  });

  it("reports a spawn failure to the caller", () => {
    let reported: Error | null = null;
    const spawnProcess: SpawnRelaunchProcess = () => ({
      unref: () => {},
      once: (_event, listener) => {
        listener(new Error("spawn failed"));
      },
    });

    spawnRelaunch(
      { command: "/home/user/Pond.AppImage", args: [], env: {} },
      {
        spawnProcess,
        onError: (error) => {
          reported = error;
        },
      },
    );

    expect(reported).toEqual(new Error("spawn failed"));
  });

  it.runIf(process.platform === "linux")(
    "closes inherited descriptors before exec",
    () => {
      const { command, args } = relaunchCommand({
        command: "/bin/sh",
        args: [
          "-c",
          // An fd path only exists while that fd is open, which also drops the
          // now-closed directory handle the glob itself was expanded through.
          'for f in /proc/$$/fd/*; do n=$(basename "$f"); if [ -e "$f" ]; then echo "$n"; fi; done',
        ],
      });
      const result = spawnSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe", ...Array(12).fill("pipe")],
      });

      expect(result.status).toBe(0);
      const fds = String(result.stdout)
        .split(/\s+/)
        .filter(Boolean)
        .map(Number);
      expect(fds).toContain(1);
      expect(fds.filter((fd) => fd > 2)).toEqual([]);
    },
  );
});
