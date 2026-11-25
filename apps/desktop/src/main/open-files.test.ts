import { describe, expect, it, vi } from "vitest";
import { flushOpenFiles, queueOpenFile } from "./open-files";

function fakeWindow(loading: boolean) {
  const awaited: Array<string> = [];
  const webContents = {
    isLoading: () => loading,
    send: vi.fn(),
    once: (event: "did-finish-load", listener: () => void) => {
      awaited.push(event);
      listener();
    },
  };
  const win = { isDestroyed: () => false, webContents };
  return { win, webContents, awaited };
}

function libraryWindow() {
  const opened = { count: 0 };
  const openLibraryWindow = async () => {
    opened.count += 1;
  };
  return { opened, openLibraryWindow };
}

describe("flushOpenFiles", () => {
  it("sends every queued file as one batch and skips Libraries", async () => {
    const { win, webContents } = fakeWindow(false);
    const { opened, openLibraryWindow } = libraryWindow();
    queueOpenFile("/tmp/a.png");
    queueOpenFile("/tmp/Archive.pond");
    queueOpenFile("/tmp/b.pdf");
    await flushOpenFiles({ openLibraryWindow, getMainWindow: () => win });
    expect(opened.count).toBe(1);
    expect(webContents.send).toHaveBeenCalledExactlyOnceWith(
      "pond:open-files",
      ["/tmp/a.png", "/tmp/b.pdf"],
    );

    await flushOpenFiles({ openLibraryWindow, getMainWindow: () => win });
    expect(opened.count).toBe(1);
  });

  it("waits for a loading window before sending", async () => {
    const { win, webContents, awaited } = fakeWindow(true);
    queueOpenFile("/tmp/a.png");
    await flushOpenFiles({
      openLibraryWindow: async () => {},
      getMainWindow: () => win,
    });
    expect(awaited).toEqual(["did-finish-load"]);
    expect(webContents.send).toHaveBeenCalledOnce();
  });

  it("does not open a window when only a Library was dropped", async () => {
    const { opened, openLibraryWindow } = libraryWindow();
    queueOpenFile("/tmp/Archive.pond");
    await flushOpenFiles({ openLibraryWindow, getMainWindow: () => null });
    expect(opened.count).toBe(0);
  });
});
