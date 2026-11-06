import { app } from "electron";
import { sourcesSkippingLikes } from "../../shared/import-scope";
import {
  attachCaptureCookies,
  captures,
  onCaptureComplete,
} from "../core/captures";
import { createFishHandoff } from "../fish-handoff";
import {
  enqueue,
  libraryInfo,
  sessionImport,
  sessionPending,
  sessionRefresh,
} from "../ops";
import type { NativePorts } from "./rpc";
import { importSharedFiles } from "./share-inbox";

const fishHandoff = createFishHandoff({
  fishExists: async (id) => {
    const { readFish } = await import("../core/fish/store");
    return readFish(id) !== null;
  },
  openMainWindow: async () => {
    const { getMainWindow, openLibraryWindow } = await import("../window");
    await openLibraryWindow();
    return getMainWindow();
  },
  activate: () => app.focus({ steal: true }),
});
onCaptureComplete(fishHandoff.complete);

export function liveNativePorts(): NativePorts {
  return {
    capture: async (draft, cookies, fishId) => {
      if (cookies?.length) attachCaptureCookies(draft.id, cookies);
      if (fishId) fishHandoff.remember(draft.id, fishId);
      return captures.accept(draft);
    },
    captureStatus: (id) => captures.status(id),
    enqueue: (url, opts) => enqueue(url, opts),
    libraryInfo,
    foldersList: async () => {
      const { listFolders } = await import("../core/folders");
      return (await listFolders()).map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        color: folder.color,
      }));
    },
    tagsList: async () => {
      const { listTags } = await import("../core/tags");
      return (await listTags())
        .filter((tag) => !tag.archived)
        .map((tag) => ({
          name: tag.name,
          starred: tag.starred,
          usageCount: tag.usageCount,
          lastUsedAt: tag.lastUsedAt?.getTime() ?? null,
        }));
    },
    fishList: async () => {
      const { listFish } = await import("../core/fish/store");
      return listFish().map((fish) => ({ id: fish.id, name: fish.name }));
    },
    extensionSettings: async () => {
      const [{ getPrefs }, { listAccounts }] = await Promise.all([
        import("../core/prefs"),
        import("../core/sync/accounts"),
      ]);
      const [prefs, accounts] = await Promise.all([getPrefs(), listAccounts()]);
      const likes = { ...prefs.extension.likes };
      for (const source of sourcesSkippingLikes(accounts))
        likes[source] = false;
      return { ...prefs.extension, likes };
    },
    sessionPending,
    sessionImport,
    sessionRefresh,
    importSharedFiles: (paths) => importSharedFiles(paths),
    appVersion: () => app.getVersion(),
  };
}
