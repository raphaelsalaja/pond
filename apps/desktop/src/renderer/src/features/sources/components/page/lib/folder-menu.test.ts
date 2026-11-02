// @vitest-environment jsdom
import { Dialog } from "@pond/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import {
  watchedFolderFlow,
  watchedFolderRevision,
} from "@/features/sources/state/watched-folder-flow";
import { menuLabels } from "@/shared/test/menu-labels";
import { buildFolderMenu, buildFolderRows } from "./folder-menu";

describe("buildFolderMenu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers pause while watching and resume when off", () => {
    const target = { name: "PNG", imported: 200, watching: true };
    expect(menuLabels(buildFolderMenu(target, () => {}))).toEqual([
      "Reveal in Finder",
      "Change Folder",
      "Pause Watching",
      "Stop Watching",
    ]);
    expect(
      menuLabels(buildFolderMenu({ ...target, watching: false }, () => {})),
    ).toContain("Resume Watching");
  });

  it("pauses the folder and refreshes", async () => {
    const query = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("pond", { query });
    const onChanged = vi.fn();
    const pause = buildFolderMenu(
      { name: "PNG", imported: 200, watching: true },
      onChanged,
    )
      .flatMap((item) => (item.type === "group" ? item.items : []))
      .find((item) => "label" in item && item.label === "Pause Watching");
    if (!pause || !("onClick" in pause)) throw new Error("Missing pause");
    pause.onClick?.();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(query).toHaveBeenCalledWith("autoImport.set", { enabled: false });
  });
});

describe("buildFolderRows", () => {
  const target = {
    name: "PNG",
    path: "/Users/raphael/PNG",
    imported: 200,
    watching: true,
  };

  function deleteAfterImport(mode: "copy" | "move", onChanged = () => {}) {
    const row = buildFolderRows({ ...target, mode }, onChanged).profile.find(
      (item) => item.id === "delete-after-import",
    );
    if (!row) throw new Error("Missing delete after import row");
    return row;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers to turn on delete after import while copying", () => {
    expect(deleteAfterImport("copy").actions[0]?.label).toBe("Turn On");
    expect(deleteAfterImport("move").actions[0]?.label).toBe("Turn Off");
  });

  it("confirms before deleting imported files from the folder", async () => {
    const query = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("pond", { query });
    const confirm = vi.spyOn(Dialog, "confirm").mockImplementation(() => {});
    const onChanged = vi.fn();
    deleteAfterImport("copy", onChanged).actions[0]?.onClick();
    expect(query).not.toHaveBeenCalled();
    const options = confirm.mock.calls[0]?.[0];
    if (!options) throw new Error("Missing confirmation");
    await options.onConfirm({ checked: false });
    expect(query).toHaveBeenCalledWith("autoImport.set", { mode: "move" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("turns delete after import off without confirming", async () => {
    const query = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("pond", { query });
    const confirm = vi.spyOn(Dialog, "confirm");
    const onChanged = vi.fn();
    deleteAfterImport("move", onChanged).actions[0]?.onClick();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("autoImport.set", { mode: "copy" });
  });
});

describe("pickWatchedFolder", () => {
  beforeEach(() => {
    watchedFolderFlow.clear();
  });

  afterEach(() => {
    watchedFolderFlow.clear();
    vi.unstubAllGlobals();
  });

  it("ignores a cancelled picker", async () => {
    vi.stubGlobal("pond", {
      query: vi.fn(async () => ({ ok: false, path: null })),
    });
    await pickWatchedFolder();
    expect(watchedFolderRevision()).toBe(0);
  });

  it("refreshes after choosing a folder", async () => {
    vi.stubGlobal("pond", {
      query: vi.fn(async () => ({ ok: true, path: "/Users/raphael/Inbox" })),
    });
    await pickWatchedFolder();
    expect(watchedFolderRevision()).toBe(1);
  });
});
