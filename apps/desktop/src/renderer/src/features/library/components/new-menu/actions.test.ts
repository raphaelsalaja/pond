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
import { createNewActions, type NewActionServices } from "./actions";

let notificationSequence = 0;
const notify = vi.fn<NewActionServices["notify"]>(
  (options) => `${options.id}:test-${++notificationSequence}`,
);
const updateNotification = vi.fn<NewActionServices["updateNotification"]>();
const folders = { refresh: vi.fn(async () => {}) };
const startEditingFolder = vi.fn<NewActionServices["startEditingFolder"]>();
const openTagCreation = vi.fn<NewActionServices["openTagCreation"]>();
const openSavedViewEditor = vi.fn<NewActionServices["openSavedViewEditor"]>();
const openSource = vi.fn<NewActionServices["openSource"]>();
const selectSave = vi.fn<NewActionServices["selectSave"]>();
const currentFolderId = vi.fn<NewActionServices["currentFolderId"]>(() => null);
let eagleImportProgress: ((progress: EagleImportProgress) => void) | null =
  null;
const unsubscribeEagleImportProgress = vi.fn();
const onEagleImportProgress = vi.fn<NewActionServices["onEagleImportProgress"]>(
  (callback) => {
    eagleImportProgress = callback;
    return unsubscribeEagleImportProgress;
  },
);
const {
  createNote,
  createBlankDocument,
  findDuplicates,
  reviewOrganization,
  importClipboard,
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
} = createNewActions({
  notify,
  updateNotification,
  refreshFolders: folders.refresh,
  startEditingFolder,
  openTagCreation,
  openSavedViewEditor,
  openSource,
  selectSave,
  currentFolderId,
  onEagleImportProgress,
});

const query = vi.fn();

describe("new menu actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationSequence = 0;
    query.mockReset();
    currentFolderId.mockReturnValue(null);
    eagleImportProgress = null;
    vi.stubGlobal("window", { pond: { query } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    closeDuplicateReview();
    closeOrganizationReview();
    selection.clear();
    libraryViewContext.set([], "library");
  });

  it("does not import or notify when a picker is cancelled", async () => {
    query.mockResolvedValue({ paths: [] });
    await importPaths("folders");
    expect(query).toHaveBeenCalledExactlyOnceWith("saves.pickImportPaths", {
      kind: "folders",
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("imports selected paths through the existing importer", async () => {
    query
      .mockResolvedValueOnce({ paths: ["/tmp/images"] })
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ ok: true, ids: ["one", "two"] });
    await importPaths("folders");
    expect(query).toHaveBeenLastCalledWith("saves.importFiles", {
      paths: ["/tmp/images"],
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved 2 items to Pond" }),
    );
  });

  it("reports unsupported file selections without claiming success", async () => {
    query
      .mockResolvedValueOnce({ paths: ["/tmp/unsupported"] })
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ ok: false, error: "no_files" });
    await expect(importPaths("files")).rejects.toThrow(
      "No files were imported",
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports an empty clipboard", async () => {
    query.mockResolvedValue({ ok: false, error: "no_files" });
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
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps only failed links for retry, including rejected queries", async () => {
    query
      .mockResolvedValueOnce({ ok: true, id: "one" })
      .mockResolvedValueOnce({ ok: false, error: "unsupported_url" })
      .mockRejectedValueOnce(new Error("offline"));
    expect(
      await importLinks("https://one.test https://two.test https://three.test"),
    ).toEqual(["https://two.test", "https://three.test"]);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Downloading" }),
    );
  });

  it("leaves added links in the library without selecting them", async () => {
    query.mockResolvedValueOnce({ ok: true, id: "first" });
    await importLinks("https://one.test");
    expect(selectSave).not.toHaveBeenCalled();
  });

  it("reports a batch of links as one download", async () => {
    query
      .mockResolvedValueOnce({ ok: true, id: "first" })
      .mockResolvedValueOnce({ ok: true, id: "second" });
    await importLinks("https://one.test https://two.test");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Downloading 2 links" }),
    );
  });

  it("creates an untitled note in the library without opening it", async () => {
    query.mockResolvedValue({ ok: true, id: "note-id" });
    await createNote();
    expect(query).toHaveBeenCalledWith("saves.createManual", {
      title: null,
      note: null,
      mediaType: "text",
    });
    expect(selectSave).toHaveBeenCalledWith("note-id");
    expect(notify).not.toHaveBeenCalled();
  });

  it("assigns a new note to the current folder", async () => {
    currentFolderId.mockReturnValue("folder-1");
    query
      .mockResolvedValueOnce({ ok: true, id: "note-id" })
      .mockResolvedValueOnce({ ok: true });
    await createNote();
    expect(query).toHaveBeenCalledWith("folders.addSaves", {
      folderId: "folder-1",
      saveIds: ["note-id"],
    });
  });

  it("does not select a failed note", async () => {
    query.mockResolvedValue({ ok: false, error: "empty_input" });
    await expect(createNote()).rejects.toThrow("Couldn't save");
    expect(selectSave).not.toHaveBeenCalled();
  });

  it("creates a blank document through the document query", async () => {
    query.mockResolvedValue({ ok: true, id: "doc-id" });
    await createBlankDocument("word");
    expect(query).toHaveBeenCalledWith("saves.createBlankDocument", {
      kind: "word",
      folderId: null,
    });
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
    query.mockResolvedValue({ id: "created" });
    await newFolder("parent");
    expect(query).toHaveBeenCalledWith("folders.create", {
      name: "Untitled",
      parentId: "parent",
    });
    expect(folders.refresh).toHaveBeenCalledOnce();
    expect(startEditingFolder).toHaveBeenCalledWith("created");
  });

  it("creates root folders without a parent field", async () => {
    query.mockResolvedValue({ id: "created" });
    await newFolder();
    expect(query).toHaveBeenCalledWith("folders.create", {
      name: "Untitled",
    });
  });

  it("opens the inline tag group draft", () => {
    newTag("tag-group");
    expect(openTagCreation).toHaveBeenCalledWith("group");
    expect(query).not.toHaveBeenCalled();
  });

  it("opens the full smart-folder rule editor", () => {
    newSmartFolder();
    expect(openSavedViewEditor).toHaveBeenCalledWith("smart_folder");
    expect(query).not.toHaveBeenCalled();
  });

  it("opens the correct source setup flow", () => {
    newSource("connect", "instagram");
    expect(openSource).toHaveBeenLastCalledWith("connect", "instagram");
    newSource("watch", "youtube");
    expect(openSource).toHaveBeenLastCalledWith("watch", "youtube");
  });

  it("refreshes folders after importing Eagle and reports partial results", async () => {
    query
      .mockResolvedValueOnce({ ok: true, path: "/tmp/design.library" })
      .mockImplementationOnce(async (_name, input) => {
        eagleImportProgress?.({
          id: input.progressId,
          processed: 6,
          total: 10,
          imported: 2,
          skipped: 3,
          failed: 1,
        });
        return { ok: true, imported: 2, skipped: 3, failed: 1 };
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
    expect(folders.refresh).toHaveBeenCalledOnce();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Imported 2 items",
        description: "3 skipped, 1 failed",
      }),
    );
  });

  it("replaces import progress with an error if Eagle import fails", async () => {
    query
      .mockResolvedValueOnce({ ok: true, path: "/tmp/wrong" })
      .mockResolvedValueOnce({
        ok: false,
        imported: 0,
        skipped: 0,
        error: "not_eagle_library",
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
    query.mockResolvedValue({ ok: false, reason: "cancelled" });
    await importPondPackage();
    expect(query).toHaveBeenCalledExactlyOnceWith("saves.importPackage", {});
    expect(notify).not.toHaveBeenCalled();
    expect(folders.refresh).not.toHaveBeenCalled();
  });

  it("refreshes folders after importing a Pond package", async () => {
    query.mockResolvedValue({ ok: true, imported: 4, skipped: 2 });
    await importPondPackage();
    expect(folders.refresh).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Imported 4 Saves",
        description: "2 skipped",
      }),
    );
  });

  it("refreshes folders after importing an Eagle package", async () => {
    query.mockResolvedValue({ ok: true, imported: 3, skipped: 1 });
    await importEaglePackage();
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "saves.importEaglePackage",
      {},
    );
    expect(folders.refresh).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Imported 3 Saves",
        description: "1 skipped",
      }),
    );
  });

  it("reports a completed library rescan", async () => {
    query.mockResolvedValue({ updated: 3, total: 1200 });
    await rescanLibrary();
    expect(query).toHaveBeenCalledExactlyOnceWith("library.rescan", {});
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Updated 3 of 1200 saves" }),
    );
  });

  it("says the library is up to date when rescan changes nothing", async () => {
    query.mockResolvedValue({ updated: 0, total: 1200 });
    await rescanLibrary();
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Library is up to date" }),
    );
  });

  it("reports a healthy integrity check", async () => {
    query.mockResolvedValue({
      ok: true,
      missing: [],
      orphans: [],
      errors: {},
    });
    await verifyIntegrity();
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "library.verifyIntegrity",
      {},
    );
    expect(updateNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Library looks healthy" }),
    );
  });

  it("says what failed when files are missing", async () => {
    query.mockResolvedValue({
      ok: true,
      missing: ["a", "b"],
      orphans: ["c"],
      errors: {},
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
    query.mockResolvedValue({
      ok: false,
      error: "Something went wrong. Try again.",
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
