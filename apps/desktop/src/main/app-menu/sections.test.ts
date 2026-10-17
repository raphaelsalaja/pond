import { describe, expect, it } from "vitest";
import { buildEditSection } from "./edit-section";
import { buildFileSection } from "./file-section";
import { buildFindSection } from "./find-section";
import { buildGoSection, buildHistorySection } from "./navigation-sections";
import { buildOrganizeSection } from "./organize-section";
import {
  buildApplicationSections,
  buildDeveloperSections,
  buildHelpSection,
  buildSettingsItem,
  buildWindowSection,
} from "./system-sections";
import { buildAppMenuTemplate } from "./template";
import type { AppMenuContext } from "./types";
import { buildViewSection } from "./view-section";

function createContext({
  isMac,
  isPackaged,
}: {
  isMac: boolean;
  isPackaged: boolean;
}): AppMenuContext {
  const noOp = () => undefined;

  return {
    accelerator: (id) => id,
    appName: "Pond",
    edit: {
      copy: noOp,
      cut: noOp,
      paste: noOp,
      redo: noOp,
      selectAll: noOp,
      undo: noOp,
    },
    isMac,
    isPackaged,
    navTo: () => noOp,
    openExternalUrl: () => noOp,
    openLibraryWindow: noOp,
    openRecent: () => noOp,
    rescanLibrary: noOp,
    reloadLibrary: noOp,
    revealLibrary: noOp,
    sendMenuAction: () => noOp,
    showLogs: noOp,
    verifyLibrary: noOp,
  };
}

describe("app menu sections", () => {
  it("keeps platform sections conditional", () => {
    const mac = createContext({ isMac: true, isPackaged: true });
    const settingsItem = buildSettingsItem(mac);

    expect(buildApplicationSections(mac, settingsItem)).toEqual([
      expect.objectContaining({
        label: "Pond",
        submenu: expect.arrayContaining([
          expect.objectContaining({ role: "about", label: "About Pond" }),
          expect.objectContaining({ label: "Check for Updates" }),
        ]),
      }),
    ]);
    expect(buildDeveloperSections(mac)).toEqual([]);

    const development = createContext({
      isMac: false,
      isPackaged: false,
    });
    expect(
      buildApplicationSections(development, buildSettingsItem(development)),
    ).toEqual([]);
    expect(buildDeveloperSections(development)).toMatchObject([
      { label: "Developer" },
    ]);

    expect(buildHelpSection(development).submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "about", label: "About Pond" }),
        expect.objectContaining({ label: "Show Logs in File Explorer" }),
      ]),
    );
  });

  it("exposes Windows Settings and Quit in conventional menus", () => {
    const context = createContext({ isMac: false, isPackaged: true });
    const settings = buildSettingsItem(context);
    expect(buildEditSection(context, settings).submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Settings" })]),
    );
    expect(buildFileSection(context).submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Reveal in File Explorer" }),
        expect.objectContaining({ role: "quit" }),
      ]),
    );
    expect(buildViewSection(context).submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Reveal in File Explorer" }),
      ]),
    );
  });

  it("keeps navigation and empty history labels", () => {
    const context = createContext({ isMac: true, isPackaged: true });

    expect(buildGoSection(context)).toEqual(
      expect.objectContaining({
        label: "Go",
        submenu: expect.arrayContaining([
          expect.objectContaining({
            label: "Back",
            registerAccelerator: false,
          }),
          expect.objectContaining({
            label: "Forward",
            registerAccelerator: false,
          }),
        ]),
      }),
    );
    expect(buildHistorySection(context, [])).toEqual({
      label: "History",
      submenu: [{ label: "No Recent Items", enabled: false }],
    });
    expect(
      buildHistorySection(context, [{ id: "save-1", title: "First Save" }]),
    ).toMatchObject({
      label: "History",
      submenu: [
        { label: "First Save" },
        { type: "separator" },
        { label: "Clear History" },
      ],
    });
  });

  it("orders first-party native menu sections", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const template = buildAppMenuTemplate(context, []);
    expect(template.map((item) => item.label)).toEqual([
      "Pond",
      "File",
      "Edit",
      "Find",
      "Organize",
      "View",
      "Go",
      "History",
      "Library",
      "Window",
      "Help",
    ]);
  });

  it("backfills Window and Help commands", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const externalUrls: string[] = [];
    context.openExternalUrl = (url) => {
      externalUrls.push(url);
      return () => undefined;
    };
    expect(buildWindowSection(context).submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "togglefullscreen" }),
      ]),
    );
    expect(buildHelpSection(context).submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Keyboard Shortcuts" }),
        expect.objectContaining({ label: "Export Debug Report" }),
        expect.objectContaining({ label: "Report an Issue" }),
      ]),
    );
    expect(externalUrls).toContain(
      "https://github.com/raphaelsalaja/pond/releases",
    );
  });

  it("dispatches native Find, Organize, File, and Edit actions", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const actions: string[] = [];
    context.sendMenuAction = (id) => {
      actions.push(id);
      return () => undefined;
    };
    const settingsItem = buildSettingsItem(context);
    buildFileSection(context);
    buildEditSection(context, settingsItem);
    buildFindSection(context);
    buildOrganizeSection(context);

    expect(actions).toEqual(
      expect.arrayContaining([
        "library.new-smart-folder-group",
        "library.import-eagle",
        "save.export-files",
        "save.export-converted",
        "save.export-eagle-package",
        "save.export-pond-package",
        "save.export-csv",
        "selection.select-all",
        "selection.clear",
        "selection.invert",
        "save.copy-name",
        "save.copy-file-path",
        "save.copy-pond-link",
        "save.remove-current-folder",
        "find.search",
        "find.search-all",
        "find.go-to-folder",
        "find.filters.toggle",
        "find.filters.reset",
        "find.visual-search",
        "organize.rating.0",
        "organize.rating.5",
        "organize.clear-tags",
        "organize.copy-tags",
        "organize.paste-tags",
      ]),
    );
  });

  it("lets the focused collection own the Select All shortcut", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const edit = buildEditSection(context, buildSettingsItem(context));
    const submenu = edit.submenu;
    if (!Array.isArray(submenu)) throw new Error("Missing Edit submenu");

    expect(submenu.find((item) => item.label === "Select All")).toMatchObject({
      accelerator: "CmdOrCtrl+A",
      registerAccelerator: false,
    });
  });

  it("uses the save action language in native menus", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const file = buildFileSection(context).submenu ?? [];
    const organize = buildOrganizeSection(context).submenu ?? [];

    expect(file).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Open Original in Browser" }),
        expect.objectContaining({ label: "Add Tags" }),
        expect.objectContaining({ label: "Refresh from Source" }),
      ]),
    );
    expect(organize).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Add Tags" })]),
    );
  });

  it("groups File actions like the tray menu without navigation", () => {
    const context = createContext({ isMac: true, isPackaged: true });
    const file = buildFileSection(context).submenu;
    if (!Array.isArray(file)) throw new Error("Missing File submenu");
    const newMenu = file.find((item) => item.label === "New");
    const importMenu = file.find((item) => item.label === "Import");
    const sourcesMenu = file.find((item) => item.label === "Sources");
    const libraryMenu = file.find((item) => item.label === "Library");

    expect(newMenu).toMatchObject({
      submenu: [
        { label: "New Folder" },
        { label: "New Smart Folder" },
        { label: "New Smart Folder Group" },
        { label: "New Watched Folder" },
        { type: "separator" },
        { label: "New Note" },
        { type: "separator" },
        { label: "New Tag" },
        { label: "New Tag Group" },
      ],
    });
    expect(importMenu).toMatchObject({
      submenu: [
        { label: "Import Files" },
        { label: "Import Folders" },
        { label: "Import from Links" },
        { label: "Import from Clipboard" },
        { type: "separator" },
        { label: "Import Bookmarks" },
        { label: "Import mymind" },
        { label: "Import Page Assets" },
        { type: "separator" },
        { label: "Import Eagle Library" },
        { label: "Import Pond Package" },
      ],
    });
    expect(sourcesMenu).toMatchObject({
      submenu: [{ label: "New Source" }, { label: "New Watch" }],
    });
    expect(libraryMenu).toMatchObject({
      submenu: [
        { label: "Find Duplicates" },
        { type: "separator" },
        { label: "Rescan Library" },
        { label: "Verify Integrity" },
      ],
    });
    expect(file).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Navigate" })]),
    );
    expect(file).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "New Folder" }),
        expect.objectContaining({ label: "Import Files" }),
      ]),
    );
  });
});
