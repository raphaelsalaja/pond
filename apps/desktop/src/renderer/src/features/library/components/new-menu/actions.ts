import type { Source } from "@pond/schema/db";
import { sourceLabel } from "@pond/schema/sources";
import type { BlankDocumentKind } from "@shared/blank-documents";
import type { EagleImportProgress } from "@shared/saves-import-contracts";
import { z } from "zod";
import { showSavesInLibrary } from "@/features/library/lib/show-saves";
import { openDuplicateReview } from "@/features/library/state/duplicate-review";
import { folders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { openOrganizationReview } from "@/features/library/state/organization-review";
import { savedViews } from "@/features/library/state/saved-views";
import {
  asUrlList,
  importClipboardWithDuplicateReview,
  importFilesWithDuplicateReview,
  libraryViewContext,
  selectOnlySave,
  showImportedAction,
} from "@/features/saves";
import { selection } from "@/features/saves/navigation";
import { openSources } from "@/features/sources";
import { tagCreation } from "@/features/tags";
import { getAppRouter } from "@/shared/lib/app-router";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { notify, updateNotification } from "@/shared/lib/toast";
import { markImportedFrom } from "@/shared/state/prompts";

const SaveResultSchema = z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

const LIST_FORMAT = new Intl.ListFormat("en", { type: "conjunction" });
const SAVES = { one: "Save", other: "Saves" };
const ITEMS = { one: "item", other: "items" };

export interface NewActionServices {
  notify: typeof notify;
  updateNotification: typeof updateNotification;
  refreshFolders: () => Promise<void>;
  startEditingFolder: (id: string) => void;
  openTagCreation: (kind: "tag" | "group") => void;
  openSavedViewEditor: (kind: "smart_folder" | "group") => void;
  openSource: (kind: "connect" | "watch", source: Source) => void;
  selectSave: (id: string) => void;
  showSaves: (ids: readonly string[], folderId?: string) => void;
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
  showSaves,
  currentFolderId,
  onEagleImportProgress,
}: NewActionServices) {
  function reportSaved(ids: string[], folderId?: string): void {
    notify({
      id: "new-import",
      title:
        ids.length === 1
          ? "Saved to Pond"
          : `Saved ${formatNumber(ids.length)} items to Pond`,
      ...showImportedAction(
        ids,
        folderId ? (shown) => showSaves(shown, folderId) : showSaves,
      ),
    });
  }

  function reportDownloading(ids: string[]): void {
    notify({
      id: "new-import",
      title:
        ids.length === 1
          ? "Downloading"
          : `Downloading ${formatNumber(ids.length)} links`,
      ...showImportedAction(ids, showSaves),
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

  async function importPaths(
    kind: "files" | "folders",
    folderId?: string,
  ): Promise<void> {
    const picked = await window.pond.query("saves.pickImportPaths", {
      kind,
    });
    if (picked.paths.length === 0) return;
    await importFilePaths(picked.paths, folderId);
  }

  async function importFilePaths(
    paths: string[],
    folderId?: string,
  ): Promise<void> {
    const result = SaveResultSchema.parse(
      await importFilesWithDuplicateReview(
        folderId ? { paths, folderIds: [folderId] } : { paths },
      ),
    );
    if (result.reason === "cancelled") return;
    if (!result.ok || !result.ids?.length) {
      throw new Error(
        "No files were imported. Choose readable, non-empty files.",
      );
    }
    reportSaved(result.ids, folderId);
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
    reportSaved(result.ids);
  }

  async function importClipboard(): Promise<void> {
    const result = SaveResultSchema.parse(
      await importClipboardWithDuplicateReview({}),
    );
    if (result.reason === "cancelled") return;
    if (!result.ok || !result.ids?.length) {
      throw new Error(
        "Copy an image or files first. Use Import from Links for URLs.",
      );
    }
    reportSaved(result.ids);
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
        ? `Imported ${formatPlural(result.imported, { one: "bookmark", other: "bookmarks" })}`
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
    if (result.imported) markImportedFrom("mymind");
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${formatPlural(result.imported, SAVES)} from mymind`
        : "Nothing new to import",
      description: result.skipped > 0 ? `${result.skipped} skipped` : undefined,
      timeout: 5000,
    });
  }

  async function importDataExport(): Promise<void> {
    const result = await window.pond.query("saves.importDataExport", {});
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      throw new Error(result.error);
    }
    await refreshFolders();
    const from = LIST_FORMAT.format(result.platforms);
    const connect = LIST_FORMAT.format(result.connect.map(sourceLabel));
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${formatPlural(result.imported, SAVES)} from ${from}`
        : "Nothing new to import",
      description:
        result.imported && connect
          ? `Connect ${connect} so Pond can capture them.`
          : result.skipped > 0
            ? `${result.skipped} skipped`
            : undefined,
      timeout: 8000,
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
        ? `Queued ${formatPlural(result.queued, { one: "image", other: "images" })}`
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
          ? `${formatNumber(progress.processed)} of ${formatPlural(progress.total, ITEMS)}`
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
    if (result.imported) markImportedFrom("eagle");
    updateNotification({
      id: notificationId,
      title: result.imported
        ? `Imported ${formatPlural(result.imported, ITEMS)}`
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
        ? `Imported ${formatPlural(result.imported, SAVES)}`
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
    if (result.imported) markImportedFrom("eagle");
    notify({
      id: "new-import",
      title: result.imported
        ? `Imported ${formatPlural(result.imported, SAVES)}`
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
          : `Updated ${formatNumber(result.updated)} of ${formatPlural(result.total, { one: "save", other: "saves" })}`,
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
    if (missing > 0) {
      happened.push(
        `${formatPlural(missing, { one: "save is", other: "saves are" })} missing from disk`,
      );
    }
    if (orphans > 0) {
      happened.push(
        `${formatPlural(orphans, { one: "file isn't", other: "files aren't" })} in the index`,
      );
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
    const added: string[] = [];
    for (const url of urls) {
      try {
        const result = SaveResultSchema.parse(
          await window.pond.query("saves.quickAdd", { url }),
        );
        if (!result.ok) failed.push(url);
        else if (result.id) added.push(result.id);
      } catch {
        failed.push(url);
      }
    }
    if (added.length > 0) reportDownloading(added);
    return failed;
  }

  return {
    runNewAction,
    newFolder,
    newTag,
    newSource,
    importPaths,
    importFilePaths,
    importLegacyLibrary,
    importClipboard,
    importBookmarks,
    importMymind,
    importDataExport,
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
  importFilePaths,
  importLegacyLibrary,
  importClipboard,
  importBookmarks,
  importMymind,
  importDataExport,
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
  showSaves: (ids, folderId) => showSavesInLibrary(ids, folderId),
  currentFolderId: () => {
    const nav = libraryChrome.getState().nav;
    return nav.kind === "folder" ? nav.id : null;
  },
  onEagleImportProgress: (callback) =>
    window.pond.onEagleImportProgress(callback),
});
