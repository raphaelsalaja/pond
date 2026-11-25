import { describe, expect, it, vi } from "vitest";
import {
  buildTrayTemplate,
  trayBadge,
  trayHeaderLabel,
  traySavingLabel,
  trayVersionLabel,
} from "./tray-status";

const library = { libraryName: "Pond", active: 1200 };

const actions = {
  onOpenDownloads: vi.fn(),
  onOpenLibrary: vi.fn(),
  onOpenSettings: vi.fn(),
  onMenuAction: vi.fn(),
};

function labelsOf(items: ReturnType<typeof buildTrayTemplate>): string[] {
  return items.flatMap((item) => {
    if (item.label == null) return [];
    if (item.submenu) return [item.label, ...labelsOf(item.submenu)];
    return [item.label];
  });
}

function findByLabel(
  items: ReturnType<typeof buildTrayTemplate>,
  label: string,
): ReturnType<typeof buildTrayTemplate>[number] | undefined {
  for (const item of items) {
    if (item.label === label) return item;
    const nested = item.submenu && findByLabel(item.submenu, label);
    if (nested) return nested;
  }
}

describe("trayBadge", () => {
  it("shows running work, not the ingest queue", () => {
    expect(trayBadge({ inflight: 4 })).toBe("4");
    expect(trayBadge({ inflight: 0 })).toBe("");
  });
});

describe("traySavingLabel", () => {
  it("stays quiet when nothing is ingesting", () => {
    expect(traySavingLabel({ ingesting: 0, inflight: 0 })).toBeNull();
  });

  it("names the queue when nothing is running", () => {
    expect(traySavingLabel({ ingesting: 248, inflight: 0 })).toBe(
      "Waiting to save 248 items",
    );
    expect(traySavingLabel({ ingesting: 1, inflight: 0 })).toBe(
      "Waiting to save 1 item",
    );
  });

  it("separates running work from the rest of the queue", () => {
    expect(traySavingLabel({ ingesting: 248, inflight: 4 })).toBe(
      "Saving 4 of 248 items",
    );
  });

  it("drops the fraction when every remaining save is in flight", () => {
    expect(traySavingLabel({ ingesting: 3, inflight: 3 })).toBe(
      "Saving 3 items",
    );
    expect(traySavingLabel({ ingesting: 1, inflight: 1 })).toBe(
      "Saving 1 item",
    );
  });
});

describe("buildTrayTemplate", () => {
  it("keeps the library count while a queue is saving", () => {
    expect(trayHeaderLabel(library)).toBe("Pond · 1200 saves");
    expect(trayVersionLabel("0.0.1")).toBe("Pond v0.0.1");
  });

  it("groups secondary actions into task-based submenus", () => {
    const template = buildTrayTemplate(
      { ...library, ingesting: 248, inflight: 4 },
      actions,
      {
        version: "0.0.1",
        blankDocuments: [{ kind: "word", label: "Word Document" }],
      },
    );

    expect(
      template.flatMap((item) => (item.label == null ? [] : item.label)),
    ).toEqual([
      "Pond · 1200 saves",
      "Saving 4 of 248 items",
      "New",
      "Import",
      "Sources",
      "Library",
      "Navigate",
      "Quit",
      "Pond v0.0.1",
    ]);
    expect(labelsOf(findByLabel(template, "New")?.submenu ?? [])).toEqual([
      "New Folder",
      "New Smart Folder",
      "New Smart Folder Group",
      "New Note",
      "Word Document",
      "New Tag",
      "New Tag Group",
    ]);
    expect(labelsOf(findByLabel(template, "Import")?.submenu ?? [])).toContain(
      "Import Eagle Library",
    );
    expect(labelsOf(findByLabel(template, "Import")?.submenu ?? [])).toContain(
      "Auto Import",
    );
    expect(labelsOf(findByLabel(template, "Sources")?.submenu ?? [])).toContain(
      "New Watch",
    );
    expect(labelsOf(findByLabel(template, "Library")?.submenu ?? [])).toContain(
      "Verify Integrity",
    );
    expect(labelsOf(findByLabel(template, "Navigate")?.submenu ?? [])).toEqual(
      expect.arrayContaining(["Untagged", "Settings"]),
    );
    expect(labelsOf(template)).not.toContain("Recently Saved");
  });

  it("opens Downloads from the saving row", () => {
    const saving = buildTrayTemplate(
      { ...library, ingesting: 248, inflight: 4 },
      actions,
      { version: "0.0.1" },
    ).find((item) => item.label === "Saving 4 of 248 items");
    saving?.click?.();
    expect(actions.onOpenDownloads).toHaveBeenCalledOnce();
  });

  it("removes Open Pond and opens Settings from Navigate", () => {
    const template = buildTrayTemplate(
      { ...library, ingesting: 0, inflight: 0 },
      actions,
      { version: "0.0.1" },
    );

    template.find((item) => item.label === "Open Pond")?.click?.();
    findByLabel(template, "Navigate")
      ?.submenu?.find((item) => item.label === "Settings")
      ?.click?.();
    expect(actions.onOpenLibrary).not.toHaveBeenCalled();
    expect(actions.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("dispatches create and search from the menu rows", () => {
    const template = buildTrayTemplate(
      { ...library, ingesting: 0, inflight: 0 },
      actions,
      {
        version: "0.0.1",
        blankDocuments: [{ kind: "word", label: "Word Document" }],
      },
    );
    findByLabel(template, "New Folder")?.click?.();
    findByLabel(template, "Word Document")?.click?.();
    findByLabel(template, "New Watch")
      ?.submenu?.find((item) => item.label === "YouTube")
      ?.click?.();
    findByLabel(template, "New Watch")
      ?.submenu?.find((item) => item.label === "RSS Feed")
      ?.click?.();
    findByLabel(template, "Navigate")
      ?.submenu?.find((item) => item.label === "Search")
      ?.click?.();
    findByLabel(template, "Navigate")
      ?.submenu?.find((item) => item.label === "Sources")
      ?.click?.();
    expect(actions.onMenuAction).toHaveBeenCalledWith("library.new-folder");
    expect(actions.onMenuAction).toHaveBeenCalledWith("library.new-blank-word");
    expect(actions.onMenuAction).toHaveBeenCalledWith("library.watch-youtube");
    expect(actions.onMenuAction).toHaveBeenCalledWith("library.watch-web");
    expect(actions.onMenuAction).toHaveBeenCalledWith("library.search");
    expect(actions.onMenuAction).toHaveBeenCalledWith("nav.sources");
  });
});
