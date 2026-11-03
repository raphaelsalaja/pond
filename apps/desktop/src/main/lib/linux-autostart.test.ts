import { describe, expect, it } from "vitest";
import {
  desktopExecArgument,
  linuxAutostartEntry,
  linuxAutostartPath,
  setLinuxAutostart,
} from "./linux-autostart";

describe("linuxAutostartPath", () => {
  it("uses the XDG config root", () => {
    expect(
      linuxAutostartPath({ XDG_CONFIG_HOME: "/mnt/config" }, "/home/test"),
    ).toBe("/mnt/config/autostart/pond.desktop");
    expect(linuxAutostartPath({}, "/home/test")).toBe(
      "/home/test/.config/autostart/pond.desktop",
    );
    expect(
      linuxAutostartPath({ XDG_CONFIG_HOME: "relative" }, "/home/test"),
    ).toBe("/home/test/.config/autostart/pond.desktop");
  });
});

describe("desktopExecArgument", () => {
  it("leaves ordinary paths alone and quotes reserved characters", () => {
    expect(desktopExecArgument("/opt/Pond/pond")).toBe("/opt/Pond/pond");
    expect(desktopExecArgument("/home/a b/Pond.AppImage")).toBe(
      '"/home/a b/Pond.AppImage"',
    );
    expect(desktopExecArgument("/home/a$b")).toBe('"/home/a\\$b"');
    expect(desktopExecArgument('/home/a"b')).toBe('"/home/a\\"b"');
    expect(desktopExecArgument("/home/a%b")).toBe("/home/a%%b");
    expect(desktopExecArgument("/home/a b%c")).toBe('"/home/a b%%c"');
  });
});

describe("linuxAutostartEntry", () => {
  it("starts Pond hidden through the login argument", () => {
    expect(
      linuxAutostartEntry({
        execPath: "/home/test/Pond.AppImage",
        args: ["--hidden"],
      }),
    ).toBe(
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Pond",
        "Comment=Start Pond in the background",
        "Exec=/home/test/Pond.AppImage --hidden",
        "Terminal=false",
        "X-GNOME-Autostart-enabled=true",
        "",
      ].join("\n"),
    );
  });
});

describe("setLinuxAutostart", () => {
  it("writes the entry when enabled", async () => {
    const writes: Array<[string, string]> = [];
    const directories: string[] = [];
    await setLinuxAutostart({
      enabled: true,
      execPath: "/opt/Pond/pond",
      args: ["--hidden"],
      path: "/home/test/.config/autostart/pond.desktop",
      makeDirectory: async (path) => {
        directories.push(path);
      },
      writeFile: async (path, body) => {
        writes.push([path, body]);
      },
    });
    expect(directories).toEqual(["/home/test/.config/autostart"]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toBe("/home/test/.config/autostart/pond.desktop");
    expect(writes[0]?.[1]).toContain("Exec=/opt/Pond/pond --hidden");
  });

  it("removes the entry when disabled, and tolerates a missing file", async () => {
    const removed: string[] = [];
    await setLinuxAutostart({
      enabled: false,
      execPath: "/opt/Pond/pond",
      path: "/home/test/.config/autostart/pond.desktop",
      exists: () => true,
      removeFile: async (path) => {
        removed.push(path);
      },
    });
    expect(removed).toEqual(["/home/test/.config/autostart/pond.desktop"]);

    await setLinuxAutostart({
      enabled: false,
      execPath: "/opt/Pond/pond",
      path: "/home/test/.config/autostart/pond.desktop",
      exists: () => false,
      removeFile: async () => {
        throw new Error("must not remove a missing file");
      },
    });
  });
});
