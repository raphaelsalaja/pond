import {
  FILE_RING_OVERLAY_IPC,
  FileRingOverlayActivateSchema,
  FileRingOverlayDropSchema,
  type FileRingOverlaySnapshot,
  overlayMenuAction,
} from "../../shared/file-ring-overlay-contracts";
import {
  closeFileRingOverlay,
  fileRingOverlayOwnsSender,
  fileRingOverlaySnapshot,
  isFileRingOverlayOpen,
  openFileRingOverlay,
  presentFileRingOverlay,
} from "../core/file-ring-overlay";
import {
  dropIntoFolder,
  type OverlayDropDeps,
} from "../core/file-ring-overlay/drop";
import { addSavesToFolder, listFolders } from "../core/folders";
import { importFiles } from "../core/import-files";
import { getPrefs } from "../core/prefs";
import { resolveSaveDrop } from "../core/save-drag-session";
import { querySidebarCounts } from "../core/sidebar-counts";
import { getDb } from "../db";
import { handleDeepLink } from "../deep-link";
import {
  getMainWindow,
  openLibraryWindow,
  resolveShellHint,
  runLibraryMenuAction,
} from "../window";
import { safeHandle } from "./helpers";
import { savesImportSourceQueries } from "./queries/saves-import-sources";

async function loadSnapshot(): Promise<FileRingOverlaySnapshot> {
  const [prefs, folders, db, shell] = await Promise.all([
    getPrefs(),
    listFolders(),
    getDb(),
    resolveShellHint(),
  ]);
  const recentIds = prefs.saveRecents.entries.map((entry) => entry.saveId);
  return {
    items: prefs.fileRing.items,
    folders: folders.map((folder) => {
      const view = prefs.folderViews[folder.id];
      return {
        id: folder.id,
        name: folder.name,
        color: folder.color,
        sortOrder: folder.sortOrder,
        icon: view?.icon,
        quickAccess: view?.quickAccess,
        quickAccessOrder: view?.quickAccessOrder,
      };
    }),
    counts: querySidebarCounts(db, [], recentIds).folders,
    shell,
  };
}

async function openFileRing(): Promise<void> {
  await openFileRingOverlay(await loadSnapshot());
}

export async function toggleFileRing(): Promise<void> {
  if (isFileRingOverlayOpen()) closeFileRingOverlay();
  else await openFileRing();
}

const DROP_DEPS: OverlayDropDeps = {
  hasFolder: async (id) =>
    (await listFolders()).some((folder) => folder.id === id),
  saveIdFor: (path) => resolveSaveDrop([path])[0] ?? null,
  addSaves: async (folderId, ids) => {
    await addSavesToFolder(folderId, ids);
  },
  importFiles: async (paths, folderId) => {
    const result = await importFiles({ paths, folderIds: [folderId] });
    return result.ok
      ? { ids: result.ids, failed: result.failedPaths?.length ?? 0 }
      : { ids: [], failed: paths.length };
  },
  quickAdd: async (url, folderId) =>
    (await savesImportSourceQueries["saves.quickAdd"]({ url, folderId })).ok,
};

function assertOwner(id: number): void {
  if (!fileRingOverlayOwnsSender(id)) throw new Error("Not the File To ring");
}

export function registerFileRingOverlayIpc(): void {
  safeHandle(FILE_RING_OVERLAY_IPC.open, () => openFileRing());
  safeHandle(FILE_RING_OVERLAY_IPC.ready, (event) => {
    assertOwner(event.sender.id);
    return fileRingOverlaySnapshot();
  });
  safeHandle(FILE_RING_OVERLAY_IPC.present, (event) => {
    assertOwner(event.sender.id);
    presentFileRingOverlay();
  });
  safeHandle(FILE_RING_OVERLAY_IPC.activate, async (event, raw) => {
    assertOwner(event.sender.id);
    const target = FileRingOverlayActivateSchema.parse(raw);
    closeFileRingOverlay();
    if (target.kind === "folder") {
      const link = `pond://folder/${encodeURIComponent(target.folderId)}`;
      if (handleDeepLink(link, getMainWindow()) === "library")
        await openLibraryWindow();
      return;
    }
    const id = overlayMenuAction(target.action);
    if (id) await runLibraryMenuAction(id);
  });
  safeHandle(FILE_RING_OVERLAY_IPC.drop, (event, raw) => {
    assertOwner(event.sender.id);
    return dropIntoFolder(FileRingOverlayDropSchema.parse(raw), DROP_DEPS);
  });
  safeHandle(FILE_RING_OVERLAY_IPC.dismiss, (event) => {
    assertOwner(event.sender.id);
    closeFileRingOverlay();
  });
}
