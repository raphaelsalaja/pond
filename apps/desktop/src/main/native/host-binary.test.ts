import { describe, expect, it } from "vitest";
import {
  prepareNativeHostBinary,
  stableLinuxNativeHostPath,
} from "./host-binary";

const SOURCE = "/tmp/.mount_Pond/native-host";

function recordingCopy() {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    copy: async (source: string, target: string) => {
      calls.push([source, target]);
    },
  };
}

describe("prepareNativeHostBinary", () => {
  it("uses the packaged path everywhere except an AppImage", async () => {
    const run = recordingCopy();
    await expect(
      prepareNativeHostBinary({
        source: SOURCE,
        platform: "linux",
        packaged: true,
        copy: run.copy,
      }),
    ).resolves.toBe(SOURCE);
    await expect(
      prepareNativeHostBinary({
        source: SOURCE,
        platform: "darwin",
        packaged: true,
        appImage: "/home/test/Pond.AppImage",
        copy: run.copy,
      }),
    ).resolves.toBe(SOURCE);
    await expect(
      prepareNativeHostBinary({
        source: SOURCE,
        platform: "linux",
        packaged: false,
        appImage: "/home/test/Pond.AppImage",
        copy: run.copy,
      }),
    ).resolves.toBe(SOURCE);
    expect(run.calls).toEqual([]);
  });

  it("copies the host out of an AppImage to a stable XDG data path", async () => {
    const run = recordingCopy();
    const modes: Array<[string, number]> = [];
    const directories: string[] = [];

    await expect(
      prepareNativeHostBinary({
        source: SOURCE,
        platform: "linux",
        packaged: true,
        appImage: "/home/test/Pond.AppImage",
        env: { XDG_DATA_HOME: "/mnt/data" },
        home: "/home/test",
        copy: run.copy,
        makeDirectory: async (path) => {
          directories.push(path);
        },
        setMode: async (path, mode) => {
          modes.push([path, mode]);
        },
      }),
    ).resolves.toBe("/mnt/data/Pond/bin/native-host");

    expect(directories).toEqual(["/mnt/data/Pond/bin"]);
    expect(run.calls).toEqual([[SOURCE, "/mnt/data/Pond/bin/native-host"]]);
    expect(modes).toEqual([["/mnt/data/Pond/bin/native-host", 0o755]]);
  });

  it("falls back to the mounted path when the copy fails", async () => {
    await expect(
      prepareNativeHostBinary({
        source: SOURCE,
        platform: "linux",
        packaged: true,
        appImage: "/home/test/Pond.AppImage",
        home: "/home/test",
        copy: async () => {
          throw new Error("read-only");
        },
        makeDirectory: async () => {},
        setMode: async () => {},
      }),
    ).resolves.toBe(SOURCE);
  });

  it("derives the stable path from XDG_DATA_HOME or the home directory", () => {
    expect(
      stableLinuxNativeHostPath("pond-native-host", {
        XDG_DATA_HOME: "/mnt/data",
      }),
    ).toBe("/mnt/data/Pond/bin/pond-native-host");
    expect(
      stableLinuxNativeHostPath(
        "pond-native-host",
        { XDG_DATA_HOME: "relative" },
        "/home/test",
      ),
    ).toBe("/home/test/.local/share/Pond/bin/pond-native-host");
  });
});
