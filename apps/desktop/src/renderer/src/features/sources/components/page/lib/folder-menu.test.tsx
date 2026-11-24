import { Dialog } from "@pond/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickWatchedFolder } from "@/features/sources/lib/watched-folder";
import {
  watchedFolderFlow,
  watchedFolderRevision,
} from "@/features/sources/state/watched-folder-flow";
import { menuLabels } from "@/shared/test/menu-labels";
import { bridge } from "@/shared/test/pond-bridge";
import { buildFolderMenu, buildFolderRows } from "./folder-menu";

function noop() {}

function deleteCheckbox(mode: "copy" | "move") {
  return buildFolderMenu(
    { name: "PNG", imported: 200, watching: true, mode },
    noop,
  )
    .flatMap((item) => (item.type === "group" ? item.items : []))
    .find((item) => item.type === "checkbox");
}

describe("buildFolderMenu", () => {
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
      "Stop Watching",
      "Delete After Import",
    ]);
    expect(
      menuLabels(buildFolderMenu({ ...target, watching: false }, () => {})),
    ).toContain("Resume Watching");
  });

  it("pauses the folder and refreshes", async () => {
    bridge.use({ query: { "autoImport.set": () => ({ ok: true }) } });
    const changed = Promise.withResolvers<void>();
    const pause = buildFolderMenu(
      { name: "PNG", imported: 200, watching: true, mode: "copy" },
      () => changed.resolve(),
    )
      .flatMap((item) => (item.type === "group" ? item.items : []))
      .find((item) => "label" in item && item.label === "Pause Watching");
    if (!pause || !("onClick" in pause)) {
      throw new Error("Missing pause");
    }
    pause.onClick?.();
    await changed.promise;
    expect(window.pond.query).toHaveBeenCalledWith("autoImport.set", {
      enabled: false,
    });
  });

  it("checks delete after import in move mode and confirms turning it on", () => {
    const confirm = vi.spyOn(Dialog, "confirm");
    expect(deleteCheckbox("move")).toMatchObject({ checked: true });
    const item = deleteCheckbox("copy");
    if (item?.type !== "checkbox") {
      throw new Error("Missing checkbox");
    }
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
    if (!row) {
      throw new Error("Missing delete after import row");
    }
    return row;
  }

  beforeEach(() => {
    bridge.use({ query: { "autoImport.set": () => ({ ok: true }) } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows delete after import as a switch that follows the mode", () => {
    expect(deleteAfterImport("copy")).toMatchObject({
      actions: [],
      toggle: { checked: false },
    });
    expect(deleteAfterImport("move").toggle?.checked).toBe(true);
  });

  it("confirms before deleting imported files from the folder", async () => {
    const confirm = vi.spyOn(Dialog, "confirm");
    const onChanged = vi.fn();
    deleteAfterImport("copy", onChanged).toggle?.onCheckedChange(true);
    expect(window.pond.query).not.toHaveBeenCalled();
    const options = confirm.mock.calls[0]?.[0];
    if (!options) {
      throw new Error("Missing confirmation");
    }
    await options.onConfirm({ checked: false });
    expect(window.pond.query).toHaveBeenCalledWith("autoImport.set", {
      mode: "move",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("turns delete after import off without confirming", async () => {
    const confirm = vi.spyOn(Dialog, "confirm");
    const changed = Promise.withResolvers<void>();
    deleteAfterImport("move", () => changed.resolve()).toggle?.onCheckedChange(
      false,
    );
    await changed.promise;
    expect(confirm).not.toHaveBeenCalled();
    expect(window.pond.query).toHaveBeenCalledWith("autoImport.set", {
      mode: "copy",
    });
  });
});

describe("pickWatchedFolder", () => {
  beforeEach(() => {
    watchedFolderFlow.clear();
  });

  afterEach(() => {
    watchedFolderFlow.clear();
  });

  it("ignores a cancelled picker", async () => {
    bridge.use({
      query: {
        "autoImport.pickFolder": () => ({ ok: false, reason: "cancelled" }),
      },
    });
    await pickWatchedFolder();
    expect(watchedFolderRevision()).toBe(0);
  });

  it("refreshes after choosing a folder", async () => {
    bridge.use({
      query: {
        "autoImport.pickFolder": () => ({
          ok: true,
          path: "/Users/raphael/Inbox",
        }),
      },
    });
    await pickWatchedFolder();
    expect(watchedFolderRevision()).toBe(1);
  });
});
