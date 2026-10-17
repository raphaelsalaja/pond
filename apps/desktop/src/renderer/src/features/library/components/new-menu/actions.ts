import type { Source } from "@pond/schema/db";
import type { BlankDocumentKind } from "@shared/blank-documents";
import type { EagleImportProgress } from "@shared/saves-import-contracts";
import { z } from "zod";
import { openDuplicateReview } from "@/features/library/state/duplicate-review";
import { folders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { openOrganizationReview } from "@/features/library/state/organization-review";
import { savedViews } from "@/features/library/state/saved-views";
import {
  asUrlList,
  importFilesWithDuplicateReview,
  libraryViewContext,
  selectOnlySave,
} from "@/features/saves";
import { selection } from "@/features/saves/navigation";
import { openSources } from "@/features/sources";
import { tagCreation } from "@/features/tags";
import { getAppRouter } from "@/shared/lib/app-router";
import { errorCopy } from "@/shared/lib/error-copy";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { notify, updateNotification } from "@/shared/lib/toast";
import { getPrefsSnapshot } from "@/shared/state/prefs";

const SaveResultSchema = z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export interface NewActionServices {
  notify: typeof notify;
  updateNotification: typeof updateNotification;
  refreshFolders: () => Promise<void>;
  startEditingFolder: (id: string) => void;
  openTagCreation: (kind: "tag" | "group") => void;
  openSavedViewEditor: (kind: "smart_folder" | "group") => void;
  openSource: (kind: "connect" | "watch", source: Source) => void;
  selectSave: (id: string) => void;
  currentFolderId: () => string | null;
  onEagleImportProgress: (
    callback: (progress: EagleImportProgress) => void,
  ) => () => void;
}

export function createNewActions({
  notify,
  updateNotification,
  refreshFolders,
  startEditingFolder,
  openTagCreation,
  openSavedViewEditor,
  openSource,
  selectSave,
  currentFolderId,
  onEagleImportProgress,
}: NewActionServices) {
  function reportSaved(count: number): void {
    notify({
      id: "new-import",
      title: count === 1 ? "Saved to Pond" : `Saved ${count} items to Pond`,
    });
  }

  function reportDownloading(count: number): void {
    notify({
      id: "new-import",
      title: count === 1 ? "Downloading" : `Downloading ${count} links`,
    });
  }

  async function runNewAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      notify({
        id: "new-import",
        title: "Couldn't complete action",
        description: errorCopy(error, "Try again."),
        timeout: 5000,
      });
    }
  }

  function newFolder(parentId?: string): Promise<void> {
    return runNewAction(async () => {
      const input = parentId
        ? { name: "Untitled", parentId }
        : { name: "Untitled" };
      const folder = await window.pond.query("folders.create", input);
      await refreshFolders();
      startEditingFolder(folder.id);
    });
  }

  function newTag(kind: "tag" | "tag-group"): void {
    openTagCreation(kind === "tag" ? "tag" : "group");
  }

  function newSource(kind: "connect" | "watch", source: Source): void {
    openSource(kind, source);
  }

  async function importPaths(kind: "files" | "folders"): Promise<void> {
    const picked = await window.pond.query("saves.pickImportPaths", {
      kind,
    });
    if (picked.paths.length === 0) return;
    const result = SaveResultSchema.parse(
      await importFilesWithDuplicateReview({ paths: picked.paths }),
    );
    if (result.reason === "cancelled") return;
    if (!result.ok || !result.ids?.length) {
      throw new Error(
        "No files were imported. Choose readable, non-empty files.",
      );
    }
    reportSaved(result.ids.length);
    const imported = result.ids.at(-1);
    if (getPrefsSnapshot()?.preferences.autoSelectAfterImport && imported)
      selectOnlySave(imported);
  }

  async function importLegacyLibrary(
    source: "ArtStation" | "Huaban" | "Pixave" | "Inboard",
  ): Promise<void> {
    const picked = await window.pond.query("saves.pickImportPaths", {
      kind: "folders",
    });
    if (picked.paths.length === 0) return;
    const result = SaveResultSchema.parse(
      await importFilesWithDuplicateReview({ paths: picked.paths }),
    );
    if (result.reason === "cancelled") return;
    if (!result.ok || !result.ids?.length) {
      throw new Error(
        `No files were imported from the ${source} export. Choose its exported media folder.`,
      );
    }
    reportSaved(result.ids.length);
  }

  async function importClipboard(): Promise<void> {
    const result = SaveResultSchema.parse(
      await window.pond.query("saves.importClipboard", {}),
    );
    if (!result.ok || !result.ids?.length) {
      throw new Error(
        "Copy an image or files first. Use Import from Links for URLs.",
      );
    }
    reportSaved(result.ids.length);
    const imported = result.ids.at(-1);
    if (getPrefsSnapshot()?.preferences.autoSelectAfterImport && imported)
      selectOnlySave(imported);
  }

  async function importBookmarks(): Promise<void> {
    const result = await window.pond.query("saves.importBookmarks", {});
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      throw new Error(result.error);
    }
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${result.imported} bookmark${result.imported === 1 ? "" : "s"}`
        : "Nothing new to import",
      description: result.skipped > 0 ? `${result.skipped} skipped` : undefined,
      timeout: 5000,
    });
  }

  async function importMymind(): Promise<void> {
    const result = await window.pond.query("saves.importMymind", {});
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      throw new Error(result.error);
    }
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${result.imported} ${result.imported === 1 ? "Save" : "Saves"} from mymind`
        : "Nothing new to import",
      description: result.skipped > 0 ? `${result.skipped} skipped` : undefined,
      timeout: 5000,
    });
  }

  async function importPageAssets(url: string): Promise<void> {
    const href = url.trim();
    if (!href) throw new Error("Enter a website link.");
    const notificationId = notify({
      id: "new-import",
      title: "Extracting page assets",
      timeout: 0,
    });
    const result = await window.pond.query("saves.extractPageAssets", {
      url: href,
    });
    if (!result.ok && !result.queued && !result.imported) {
      updateNotification({
        id: notificationId,
        title: "Couldn't extract images from that page",
        description: "Try again.",
        timeout: 5000,
      });
      return;
    }
    updateNotification({
      id: notificationId,
      title: result.queued
        ? `Queued ${result.queued} ${result.queued === 1 ? "image" : "images"}`
        : "No images large enough",
      timeout: 5000,
    });
  }

  async function importEagle(): Promise<void> {
    const picked = await window.pond.query("saves.pickEagleLibrary", {});
    if (!picked.ok || !picked.path) return;
    const progressId = crypto.randomUUID();
    const notificationId = notify({
      id: "new-import",
      title: "Importing Eagle library",
      description: "Preparing library",
      progress: { label: "Eagle library import progress" },
      timeout: 0,
    });
    const unsubscribe = onEagleImportProgress((progress) => {
      if (progress.id !== progressId) return;
      const hasItems = progress.total > 0;
      updateNotification({
        id: notificationId,
        title: "Importing Eagle library",
        description: hasItems
          ? `${progress.processed} of ${progress.total} item${progress.total === 1 ? "" : "s"}`
          : "Checking library",
        progress: {
          label: "Eagle library import progress",
          detail: `${progress.imported} imported · ${progress.skipped} skipped · ${progress.failed} failed`,
          value: hasItems ? progress.processed : undefined,
          max: hasItems ? progress.total : undefined,
        },
        timeout: 0,
      });
    });
    const result = await window.pond
      .query("saves.importEagleLibrary", {
        path: picked.path,
        progressId,
      })
      .finally(unsubscribe);
    if (!result.ok && !result.imported && !result.skipped) {
      updateNotification({
        id: notificationId,
        title:
          result.error === "not_eagle_library"
            ? "That folder doesn't look like an Eagle library"
            : "Couldn't import the Eagle library",
        description:
          result.error === "not_eagle_library" ? undefined : "Try again.",
        timeout: 5000,
      });
      return;
    }
    await refreshFolders();
    updateNotification({
      id: notificationId,
      title: result.imported
        ? `Imported ${result.imported} item${result.imported === 1 ? "" : "s"}`
        : "Nothing new to import",
      description: `${result.skipped} skipped, ${result.failed} failed`,
      timeout: 5000,
    });
  }

  async function importPondPackage(): Promise<void> {
    const result = await window.pond.query("saves.importPackage", {});
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      throw new Error(
        result.error || "Couldn't import the package. Try again.",
      );
    }
    await refreshFolders();
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${result.imported} Save${result.imported === 1 ? "" : "s"}`
        : "Nothing new to import",
      description: result.skipped ? `${result.skipped} skipped` : undefined,
      timeout: 5000,
    });
  }

  async function importEaglePackage(): Promise<void> {
    const result = await window.pond.query("saves.importEaglePackage", {});
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      throw new Error(
        result.error || "Couldn't import the Eagle package. Try again.",
      );
    }
    await refreshFolders();
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${result.imported} Save${result.imported === 1 ? "" : "s"}`
        : "Nothing new to import",
      description: result.skipped ? `${result.skipped} skipped` : undefined,
      timeout: 5000,
    });
  }

  async function createNote(): Promise<void> {
    const result = SaveResultSchema.parse(
      await window.pond.query("saves.createManual", {
        title: null,
        note: null,
        mediaType: "text",
      }),
    );
    if (!result.ok || !result.id)
      throw new Error("Couldn't save the note. Try again.");
    await placeCreatedSave(result.id);
  }

  async function createBlankDocument(kind: BlankDocumentKind): Promise<void> {
    const result = SaveResultSchema.parse(
      await window.pond.query("saves.createBlankDocument", {
        kind,
        folderId: currentFolderId(),
      }),
    );
    if (!result.ok || !result.id)
      throw new Error("Couldn't create the document. Try again.");
    selectSave(result.id);
  }

  async function placeCreatedSave(id: string): Promise<void> {
    const folderId = currentFolderId();
    if (folderId) {
      await window.pond.query("folders.addSaves", {
        folderId,
        saveIds: [id],
      });
    }
    selectSave(id);
  }

  function newSmartFolder(): void {
    openSavedViewEditor("smart_folder");
  }

  function findDuplicates(scope: "all" | "list" | "selected"): void {
    if (scope === "all") {
      openDuplicateReview({});
      return;
    }
    if (scope === "list") {
      openDuplicateReview({ ids: [...libraryViewContext.filteredIds()] });
      return;
    }
    const ids = selection.snapshot();
    if (ids.length === 0) {
      notify({
        id: "new-import",
        title: "Select Saves first",
        description: "Choose items in the library, then scan selected.",
      });
      return;
    }
    openDuplicateReview({ ids: [...ids] });
  }

  function reviewOrganization(scope: "all" | "list" | "selected"): void {
    if (scope === "all") {
      openOrganizationReview();
      return;
    }
    const ids =
      scope === "list"
        ? libraryViewContext.filteredIds()
        : selection.snapshot();
    if (ids.length < 3) {
      notify({
        id: "organization-review",
        title: "Select at least 3 Saves",
        description: "Choose more Saves, then review organization.",
      });
      return;
    }
    openOrganizationReview(ids);
  }

  async function rescanLibrary(): Promise<void> {
    const notificationId = notify({
      id: "new-import",
      title: "Rescanning library",
      timeout: 0,
    });
    const result = await window.pond.query("library.rescan", {});
    updateNotification({
      id: notificationId,
      title:
        result.updated === 0
          ? "Library is up to date"
          : `Updated ${result.updated} of ${result.total} saves`,
    });
  }

  async function verifyIntegrity(): Promise<void> {
    const notificationId = notify({
      id: "new-import",
      title: "Verifying library",
      timeout: 0,
    });
    const result = await window.pond.query("library.verifyIntegrity", {});
    if (!result.ok) {
      updateNotification({
        id: notificationId,
        title: "Couldn't verify the library",
        description: result.error,
        timeout: 5000,
      });
      return;
    }
    const missing = result.missing?.length ?? 0;
    const orphans = result.orphans?.length ?? 0;
    const errorCount = Object.keys(result.errors ?? {}).length;
    if (missing === 0 && orphans === 0 && errorCount === 0) {
      updateNotification({
        id: notificationId,
        title: "Library looks healthy",
      });
      return;
    }
    const happened: string[] = [];
    if (missing === 1) happened.push("1 save is missing from disk");
    else if (missing > 1) {
      happened.push(`${missing} saves are missing from disk`);
    }
    if (orphans === 1) happened.push("1 file isn't in the index");
    else if (orphans > 1) {
      happened.push(`${orphans} files aren't in the index`);
    }
    if (errorCount > 0 && happened.length === 0) {
      happened.push("Couldn't verify every file");
    }
    updateNotification({
      id: notificationId,
      title: happened.join(". "),
      description:
        result.errors?.library ??
        `${REVEAL_LABEL} to check the Library, or rescan.`,
      timeout: 5000,
    });
  }

  async function exportDebugReport(): Promise<void> {
    const result = await window.pond.query("library.exportDebugReport", {});
    if (!result.ok && result.reason !== "cancelled")
      throw new Error("Couldn't export the debug report.");
    if (result.ok)
      notify({ id: "debug-report", title: "Debug Report Exported" });
  }

  function parseImportLinks(text: string): string[] {
    const urls = asUrlList(text);
    if (
      !urls ||
      urls.some((value) => {
        try {
          const url = new URL(value);
          return !url.hostname || !["https:", "http:"].includes(url.protocol);
        } catch {
          return true;
        }
      })
    )
      throw new Error("Enter valid website links, one per line.");
    return [...new Set(urls)];
  }

  async function importLinks(text: string): Promise<string[]> {
    const urls = parseImportLinks(text);
    const failed: string[] = [];
    const added: Array<string | null> = [];
    for (const url of urls) {
      try {
        const result = SaveResultSchema.parse(
          await window.pond.query("saves.quickAdd", { url }),
        );
        if (!result.ok) failed.push(url);
        else added.push(result.id ?? null);
      } catch {
        failed.push(url);
      }
    }
    if (added.length > 0) reportDownloading(added.length);
    const newest = added.findLast((id) => id !== null);
    if (newest && getPrefsSnapshot()?.preferences.autoSelectAfterImport)
      selectSave(newest);
    return failed;
  }

  return {
    runNewAction,
    newFolder,
    newTag,
    newSource,
    importPaths,
    importLegacyLibrary,
    importClipboard,
    importBookmarks,
    importMymind,
    importPageAssets,
    importEagle,
    importEaglePackage,
    importPondPackage,
    createNote,
    createBlankDocument,
    newSmartFolder,
    findDuplicates,
    reviewOrganization,
    rescanLibrary,
    verifyIntegrity,
    exportDebugReport,
    parseImportLinks,
    importLinks,
  };
}

export const {
  runNewAction,
  newFolder,
  newTag,
  newSource,
  importPaths,
  importLegacyLibrary,
  importClipboard,
  importBookmarks,
  importMymind,
  importPageAssets,
  importEagle,
  importEaglePackage,
  importPondPackage,
  createNote,
  createBlankDocument,
  newSmartFolder,
  findDuplicates,
  reviewOrganization,
  rescanLibrary,
  verifyIntegrity,
  exportDebugReport,

  importLinks,
} = createNewActions({
  notify,
  updateNotification,
  refreshFolders: () => folders.refresh(),
  startEditingFolder: (id) => folders.startEditing(id),
  openTagCreation: (kind) => {
    getAppRouter()?.history.push("/tags");
    tagCreation.request(kind);
  },
  openSavedViewEditor: (kind) => savedViews.openEditor({ kind }),
  openSource: (kind, source) => openSources({ type: kind, source }),
  selectSave: selectOnlySave,
  currentFolderId: () => {
    const nav = libraryChrome.getState().nav;
    return nav.kind === "folder" ? nav.id : null;
  },
  onEagleImportProgress: (callback) =>
    window.pond.onEagleImportProgress(callback),
});
