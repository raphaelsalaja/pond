import type { EagleImportProgress } from "@shared/saves-import-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeDuplicateReview,
  duplicateReview,
} from "@/features/library/state/duplicate-review";
import {
  closeOrganizationReview,
  organizationReview,
} from "@/features/library/state/organization-review";
import { libraryViewContext } from "@/features/saves";
import { selection } from "@/features/saves/navigation";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { bridge } from "@/shared/test/pond-bridge";
import { createNewActions } from "./actions";
import type { NewActionServices } from "./actions";

let notificationSequence = 0;
let folderId: string | null = null;
let eagleImportProgress: ((progress: EagleImportProgress) => void) | null =
  null;
const updateNotification = vi.fn<NewActionServices["updateNotification"]>();
const startEditingFolder = vi.fn<NewActionServices["startEditingFolder"]>();
const openTagCreation = vi.fn<NewActionServices["openTagCreation"]>();
const openSavedViewEditor = vi.fn<NewActionServices["openSavedViewEditor"]>();
const openSource = vi.fn<NewActionServices["openSource"]>();
const selectSave = vi.fn<NewActionServices["selectSave"]>();
const showSaves = vi.fn<NewActionServices["showSaves"]>();
const unsubscribeEagleImportProgress = vi.fn();
const services: NewActionServices = {
  notify: (options) => `${options.id}:test-${++notificationSequence}`,
  updateNotification,
  refreshFolders: async () => {},
  startEditingFolder,
  openTagCreation,
  openSavedViewEditor,
  openSource,
  selectSave,
  showSaves,
  currentFolderId: () => folderId,
  onEagleImportProgress: (callback) => {
    eagleImportProgress = callback;
    return unsubscribeEagleImportProgress;
  },
};
const notify = vi.spyOn(services, "notify");
const refreshFolders = vi.spyOn(services, "refreshFolders");
const {
  createNote,
  createBlankDocument,
  findDuplicates,
  reviewOrganization,
  importClipboard,
  importDataExport,
  importEagle,
  importEaglePackage,
  importLinks,
  importPaths,
  importPondPackage,
  newFolder,
  newSource,
  newSmartFolder,
  newTag,
  parseImportLinks,
  rescanLibrary,
  runNewAction,
  verifyIntegrity,
} = createNewActions(services);

function clickShowInLibrary(): void {
  const options = notify.mock.lastCall?.[0];
  expect(options?.action?.label).toBe("Show in Library");
  options?.action?.onClick();
}

function eagleDetails() {
  return {
    deletedSkipped: 0,
    lockedFolders: [],
    droppedFields: [],
    approximatedRules: [],
    shortcuts: { status: "missing" as const, importable: 0, imported: 0 },
  };
}

describe("new menu actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationSequence = 0;
    folderId = null;
    eagleImportProgress = null;
  });
  afterEach(() => {
    closeDuplicateReview();
    closeOrganizationReview();
    selection.clear();
    libraryViewContext.set([], "library");
  });

  it("does not import or notify when a picker is cancelled", async () => {
    bridge.use({ query: { "saves.pickImportPaths": () => ({ paths: [] }) } });
    await importPaths("folders");
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "saves.pickImportPaths",
      { kind: "folders" },
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("imports selected paths through the existing importer", async () => {
    bridge.use({
      query: {
        "saves.pickImportPaths": () => ({ paths: ["/tmp/images"] }),
        "saves.reviewImportDuplicates": () => ({ candidates: [] }),
        "saves.importFiles": () => ({ ok: true, ids: ["one", "two"] }),
      },
    });
    await importPaths("folders");
    expect(window.pond.query).toHaveBeenLastCalledWith("saves.importFiles", {
      paths: ["/tmp/images"],
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved 2 items to Pond" }),
    );
    expect(showSaves).not.toHaveBeenCalled();
    clickShowInLibrary();
    expect(showSaves).toHaveBeenCalledExactlyOnceWith(["one", "two"]);
  });

  it("shows the Saves a clipboard import returned", async () => {
    bridge.use({
      query: {
        "saves.stageClipboard": () => ({
          ok: true,
          paths: ["/tmp/pond-clip/a.png"],
        }),
        "saves.reviewImportDuplicates": () => ({ candidates: [] }),
        "saves.importFiles": () => ({ ok: true, ids: ["pasted"] }),
      },
    });
    await importClipboard();
    expect(window.pond.query).toHaveBeenLastCalledWith("saves.importFiles", {
      paths: ["/tmp/pond-clip/a.png"],
      origin: "clipboard",
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved to Pond" }),
    );
    clickShowInLibrary();
    expect(showSaves).toHaveBeenCalledExactlyOnceWith(["pasted"]);
  });

  it("files picked for a folder land in that folder", async () => {
    bridge.use({
      query: {
        "saves.pickImportPaths": () => ({ paths: ["/tmp/poster.png"] }),
        "saves.reviewImportDuplicates": () => ({ candidates: [] }),
        "saves.importFiles": () => ({ ok: true, ids: ["one"] }),
      },
    });
    await importPaths("files", "posters");
    expect(window.pond.query).toHaveBeenLastCalledWith("saves.importFiles", {
      paths: ["/tmp/poster.png"],
      folderIds: ["posters"],
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved to Pond" }),
    );
    clickShowInLibrary();
    expect(showSaves).toHaveBeenCalledExactlyOnceWith(["one"], "posters");
  });

  it("reports unsupported file selections without claiming success", async () => {
    bridge.use({
      query: {
        "saves.pickImportPaths": () => ({ paths: ["/tmp/unsupported"] }),
        "saves.reviewImportDuplicates": () => ({ candidates: [] }),
        "saves.importFiles": () => ({ ok: false, error: "no_files" }),
      },
    });
    await expect(importPaths("files")).rejects.toThrow(
      "No files were imported",
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports an empty clipboard", async () => {
    bridge.use({
      query: {
        "saves.stageClipboard": () => ({
          ok: false,
          error: "empty_clipboard",
        }),
      },
    });
    await expect(importClipboard()).rejects.toThrow(
      "Copy an image or files first",
    );
  });

  it("normalizes and deduplicates links", () => {
    expect(
      parseImportLinks("example.com\nhttps://example.com\nhttps://pond.app"),
    ).toEqual(["https://example.com", "https://pond.app"]);
  });

  it.each([
    "",
    "hello",
    "https://",
    "file:///tmp/file",
    "https://pond.app invalid",
  ])("rejects invalid links before importing: %s", async (input) => {
    await expect(importLinks(input)).rejects.toThrow(
      "Enter valid website links",
    );
    expect(window.pond.query).not.toHaveBeenCalled();
  });

  it("keeps only failed links for retry, including rejected queries", async () => {
    bridge.use({
      query: {
        "saves.quickAdd": async ({ url } = {}) => {
          if (url === "https://three.test") {
            throw new Error("offline");
          }
          return url === "https://one.test"
            ? { ok: true, id: "one" }
            : { ok: false, error: "unsupported_url" };
        },
      },
    });
    expect(
      await importLinks("https://one.test https://two.test https://three.test"),
    ).toEqual(["https://two.test", "https://three.test"]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Downloading" }),
    );
    clickShowInLibrary();
    expect(showSaves).toHaveBeenCalledExactlyOnceWith(["one"]);
  });

  it("stays quiet when every link failed", async () => {
    bridge.use({
      query: {
        "saves.quickAdd": () => ({ ok: false, error: "unsupported_url" }),
      },
    });
    await importLinks("https://one.test");
    expect(notify).not.toHaveBeenCalled();
  });

  it("leaves added links in the library without selecting them", async () => {
    bridge.use({
      query: { "saves.quickAdd": () => ({ ok: true, id: "first" }) },
    });
    await importLinks("https://one.test");
    expect(selectSave).not.toHaveBeenCalled();
  });

  it("reports a batch of links as one download", async () => {
    bridge.use({
      query: {
        "saves.quickAdd": ({ url } = {}) => ({
          ok: true,
          id: url === "https://one.test" ? "first" : "second",
        }),
      },
    });
    await importLinks("https://one.test https://two.test");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Downloading 2 links" }),
    );
  });

  it("creates an untitled note in the library without opening it", async () => {
    bridge.use({
      query: { "saves.createManual": () => ({ ok: true, id: "note-id" }) },
    });
    await createNote();
    expect(window.pond.query).toHaveBeenCalledWith("saves.createManual", {
      title: null,
      note: null,
      mediaType: "text",
    });
    expect(selectSave).toHaveBeenCalledWith("note-id");
    expect(notify).not.toHaveBeenCalled();
  });

  it("assigns a new note to the current folder", async () => {
    folderId = "folder-1";
    bridge.use({
      query: {
        "saves.createManual": () => ({ ok: true, id: "note-id" }),
        "folders.addSaves": () => ({ ok: true, undoId: null }),
      },
    });
    await createNote();
    expect(window.pond.query).toHaveBeenCalledWith("folders.addSaves", {
      folderId: "folder-1",
      saveIds: ["note-id"],
    });
  });

  it("does not select a failed note", async () => {
    bridge.use({
      query: {
        "saves.createManual": () => ({ ok: false, error: "empty_input" }),
      },
    });
    await expect(createNote()).rejects.toThrow("Couldn't save");
    expect(selectSave).not.toHaveBeenCalled();
  });

  it("creates a blank document through the document query", async () => {
    bridge.use({
      query: {
        "saves.createBlankDocument": () => ({ ok: true, id: "doc-id" }),
      },
    });
    await createBlankDocument("word");
    expect(window.pond.query).toHaveBeenCalledWith(
      "saves.createBlankDocument",
      { kind: "word", folderId: null },
    );
    expect(selectSave).toHaveBeenCalledWith("doc-id");
  });

  it("opens Find Duplicates for the whole library", () => {
    findDuplicates("all");
    expect(duplicateReview.state?.saveId).toBeNull();
    expect(duplicateReview.state?.ids).toBeNull();
  });

  it("scans the current list for duplicates", () => {
    libraryViewContext.set(["a", "b"], "library");
    findDuplicates("list");
    expect(duplicateReview.state?.ids).toEqual(["a", "b"]);
  });

  it("scans the current selection for duplicates", () => {
    selection.set(["one", "two"]);
    findDuplicates("selected");
    expect(duplicateReview.state?.ids).toEqual(["one", "two"]);
  });

  it("asks to select Saves before scanning selected", () => {
    findDuplicates("selected");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Select Saves first" }),
    );
    expect(duplicateReview.state).toBeNull();
  });

  it("reviews organization for the current selection", () => {
    selection.set(["one", "two", "three"]);
    reviewOrganization("selected");
    expect(organizationReview.state?.ids).toEqual(["one", "two", "three"]);
  });

  it("creates an untitled folder and starts inline naming", async () => {
    bridge.use({
      query: {
        "folders.create": (input) => ({
          id: "created",
          name: input.name,
          parentId: input.parentId ?? null,
          color: null,
          sortOrder: 0,
          createdAt: new Date(0),
        }),
      },
    });
    await newFolder("parent");
    expect(window.pond.query).toHaveBeenCalledWith("folders.create", {
      name: "Untitled",
      parentId: "parent",
    });
    expect(refreshFolders).toHaveBeenCalledOnce();
    expect(startEditingFolder).toHaveBeenCalledWith("created");
  });

  it("creates root folders without a parent field", async () => {
    bridge.use({
      query: {
        "folders.create": (input) => ({
          id: "created",
          name: input.name,
          parentId: null,
          color: null,
          sortOrder: 0,
          createdAt: new Date(0),
        }),
      },
    });
    await newFolder();
    expect(window.pond.query).toHaveBeenCalledWith("folders.create", {
      name: "Untitled",
    });
  });

  it("opens the inline tag group draft", () => {
    newTag("tag-group");
    expect(openTagCreation).toHaveBeenCalledWith("group");
    expect(window.pond.query).not.toHaveBeenCalled();
  });

  it("opens the full smart-folder rule editor", () => {
    newSmartFolder();
    expect(openSavedViewEditor).toHaveBeenCalledWith("smart_folder");
    expect(window.pond.query).not.toHaveBeenCalled();
  });

  it("opens the correct source setup flow", () => {
    newSource("connect", "instagram");
    expect(openSource).toHaveBeenLastCalledWith("connect", "instagram");
    newSource("watch", "youtube");
    expect(openSource).toHaveBeenLastCalledWith("watch", "youtube");
  });

  it("refreshes folders after importing Eagle and reports partial results", async () => {
    bridge.use({
      query: {
        "saves.pickEagleLibrary": () => ({
          ok: true,
          path: "/tmp/design.library",
        }),
        "saves.importEagleLibrary": (input) => {
          eagleImportProgress?.({
            id: input.progressId ?? "",
            processed: 6,
            total: 10,
            imported: 2,
            skipped: 3,
            failed: 1,
          });
          return {
            ok: true,
            imported: 2,
            skipped: 3,
            failed: 1,
            ...eagleDetails(),
          };
        },
      },
    });
    await importEagle();
    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Importing Eagle library",
        description: "6 of 10 items",
        progress: {
          label: "Eagle library import progress",
          detail: "2 imported · 3 skipped · 1 failed",
          value: 6,
          max: 10,
        },
      }),
    );
    expect(unsubscribeEagleImportProgress).toHaveBeenCalledOnce();
    expect(refreshFolders).toHaveBeenCalledOnce();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Imported 2 items",
        description: "3 skipped, 1 failed",
      }),
    );
  });

  it("replaces import progress with an error if Eagle import fails", async () => {
    bridge.use({
      query: {
        "saves.pickEagleLibrary": () => ({ ok: true, path: "/tmp/wrong" }),
        "saves.importEagleLibrary": () => ({
          ok: false,
          error: "not_eagle_library",
          imported: 0,
          skipped: 0,
          failed: 0,
          ...eagleDetails(),
        }),
      },
    });
    await runNewAction(importEagle);
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "new-import:test-1",
        title: "That folder doesn't look like an Eagle library",
        timeout: 5000,
      }),
    );
  });

  it("does not import or notify when a Pond package picker is cancelled", async () => {
    bridge.use({
      query: {
        "saves.importPackage": () => ({ ok: false, reason: "cancelled" }),
      },
    });
    await importPondPackage();
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "saves.importPackage",
      {},
    );
    expect(notify).not.toHaveBeenCalled();
    expect(refreshFolders).not.toHaveBeenCalled();
  });

  it("refreshes folders after importing a Pond package", async () => {
    bridge.use({
      query: {
        "saves.importPackage": () => ({ ok: true, imported: 4, skipped: 2 }),
      },
    });
    await importPondPackage();
    expect(refreshFolders).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Imported 4 Saves",
        description: "2 skipped",
      }),
    );
    expect(notify.mock.lastCall?.[0].action).toBeUndefined();
  });

  it("refreshes folders after importing an Eagle package", async () => {
    bridge.use({
      query: {
        "saves.importEaglePackage": () => ({
          ok: true,
          imported: 3,
          skipped: 1,
        }),
      },
    });
    await importEaglePackage();
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "saves.importEaglePackage",
      {},
    );
    expect(refreshFolders).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Imported 3 Saves",
        description: "1 skipped",
      }),
    );
  });

  it("does not notify when the data export picker is cancelled", async () => {
    bridge.use({
      query: {
        "saves.importDataExport": () => ({ ok: false, reason: "cancelled" }),
      },
    });
    await importDataExport();
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "saves.importDataExport",
      {},
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("names the platforms and asks you to connect missing Sources", async () => {
    bridge.use({
      query: {
        "saves.importDataExport": () => ({
          ok: true,
          imported: 12,
          skipped: 3,
          platforms: ["X", "Instagram", "YouTube"],
          connect: ["twitter", "instagram"],
        }),
      },
    });
    await importDataExport();
    expect(refreshFolders).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Imported 12 Saves from X, Instagram, and YouTube",
        description: "Connect Twitter and Instagram so Pond can capture them.",
      }),
    );
  });

  it("reports skipped Saves when every Source is connected", async () => {
    bridge.use({
      query: {
        "saves.importDataExport": () => ({
          ok: true,
          imported: 0,
          skipped: 4,
          platforms: ["Reddit"],
          connect: [],
        }),
      },
    });
    await importDataExport();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Nothing new to import",
        description: "4 skipped",
      }),
    );
  });

  it("surfaces an unreadable data export", async () => {
    bridge.use({
      query: {
        "saves.importDataExport": () => ({
          ok: false,
          error: "Not an export.",
        }),
      },
    });
    await expect(importDataExport()).rejects.toThrow("Not an export.");
  });

  it("reports a completed library rescan", async () => {
    bridge.use({
      query: {
        "library.rescan": () => ({ updated: 3, total: 1200, missingFiles: [] }),
      },
    });
    await rescanLibrary();
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "library.rescan",
      {},
    );
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Updated 3 of 1,200 saves" }),
    );
  });

  it("says the library is up to date when rescan changes nothing", async () => {
    bridge.use({
      query: {
        "library.rescan": () => ({ updated: 0, total: 1200, missingFiles: [] }),
      },
    });
    await rescanLibrary();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Library is up to date" }),
    );
  });

  it("reports a healthy integrity check", async () => {
    bridge.use({
      query: {
        "library.verifyIntegrity": () => ({
          ok: true,
          missing: [],
          orphans: [],
          errors: {},
        }),
      },
    });
    await verifyIntegrity();
    expect(window.pond.query).toHaveBeenCalledExactlyOnceWith(
      "library.verifyIntegrity",
      {},
    );
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Library looks healthy" }),
    );
  });

  it("says what failed when files are missing", async () => {
    bridge.use({
      query: {
        "library.verifyIntegrity": () => ({
          ok: true,
          missing: ["a", "b"],
          orphans: ["c"],
          errors: {},
        }),
      },
    });
    await verifyIntegrity();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "2 saves are missing from disk. 1 file isn't in the index",
        description: `${REVEAL_LABEL} to check the Library, or rescan.`,
      }),
    );
  });

  it("surfaces a failed integrity check", async () => {
    bridge.use({
      query: {
        "library.verifyIntegrity": () => ({
          ok: false,
          error: "Something went wrong. Try again.",
        }),
      },
    });
    await verifyIntegrity();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Couldn't verify the library",
        description: "Something went wrong. Try again.",
        timeout: 5000,
      }),
    );
  });
});
