import { describe, expect, it } from "vitest";
import { LAUNCHABLE_FILE_MESSAGE, openSavedFile } from "./open-saved-file";

function fakeShell(result = "") {
  const calls: string[] = [];
  return {
    calls,
    shell: {
      openPath: async (path: string) => {
        calls.push(`open:${path}`);
        return result;
      },
      showItemInFolder: (path: string) => void calls.push(`reveal:${path}`),
    },
  };
}

describe("openSavedFile", () => {
  it.each([
    "C:/Lib/items/a.exe",
    "C:/Lib/items/SETUP.BAT",
    "C:/Lib/items/run.cmd",
    "C:/Lib/items/x.ps1",
    "C:/Lib/items/x.lnk",
    "C:/Lib/items/photo.png.scr",
    "C:/Lib/items/payload.exe.",
    "C:/Lib/items/payload.exe ",
  ])("reveals %s instead of running it on Windows", async (path) => {
    const { shell, calls } = fakeShell();
    expect(await openSavedFile(path, shell, "win32")).toBe(
      LAUNCHABLE_FILE_MESSAGE,
    );
    expect(calls).toEqual([`reveal:${path}`]);
  });

  it("opens ordinary files and passes the shell error through", async () => {
    const { shell, calls } = fakeShell("no app");
    expect(await openSavedFile("C:/Lib/a.png", shell, "win32")).toBe("no app");
    expect(await openSavedFile("C:/Lib/a.exe.png", shell, "win32")).toBe(
      "no app",
    );
    expect(calls).toEqual(["open:C:/Lib/a.png", "open:C:/Lib/a.exe.png"]);
  });

  it("keeps the macOS and Linux behavior", async () => {
    const { shell, calls } = fakeShell();
    expect(await openSavedFile("/lib/tool.exe", shell, "darwin")).toBe("");
    expect(await openSavedFile("/lib/tool.sh", shell, "linux")).toBe("");
    expect(calls).toEqual(["open:/lib/tool.exe", "open:/lib/tool.sh"]);
  });
});
