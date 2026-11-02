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
    const target = {
      name: "PNG",
      imported: 200,
      watching: true,
      mode: "copy" as const,
    };
    expect(menuLabels(buildFolderMenu(target, () => {}))).toEqual([
      "Reveal in Finder",
      "Change Folder",
      "Pause Watching",
      "Delete After Import",
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
      { name: "PNG", imported: 200, watching: true, mode: "copy" },
      onChanged,
    )
      .flatMap((item) => (item.type === "group" ? item.items : []))
      .find((item) => "label" in item && item.label === "Pause Watching");
    if (!pause || !("onClick" in pause)) throw new Error("Missing pause");
    pause.onClick?.();
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(query).toHaveBeenCalledWith("autoImport.set", { enabled: false });
  });

  it("checks delete after import in move mode and confirms turning it on", () => {
    const confirm = vi.spyOn(Dialog, "confirm").mockImplementation(() => {});
    const find = (mode: "copy" | "move") =>
      buildFolderMenu(
        { name: "PNG", imported: 200, watching: true, mode },
        () => {},
      )
        .flatMap((item) => (item.type === "group" ? item.items : []))
        .find((item) => item.type === "checkbox");
    expect(find("move")).toMatchObject({ checked: true });
    const item = find("copy");
    if (item?.type !== "checkbox") throw new Error("Missing checkbox");
    expect(item.checked).toBe(false);
    item.onCheckedChange?.(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Delete After Import" }),
    );
    confirm.mockRestore();
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
